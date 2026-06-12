"""Admin CRM: stats, users, reports, security events, roles, audit log."""
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from db import db
from models import AdminResolveReportIn, AdminRoleIn
from security import require_admin, require_staff
from utils import log_admin_action, mask_email, mask_ip, now_iso, public_user
from ws_manager import manager

router = APIRouter()


@router.get("/admin/me")
async def admin_me(user: dict = Depends(require_staff)):
    return public_user(user)


@router.get("/admin/stats")
async def admin_stats(user: dict = Depends(require_staff)):
    now = datetime.now(timezone.utc)
    last_24h = (now - timedelta(hours=24)).isoformat()
    last_7d = (now - timedelta(days=7)).isoformat()
    total_users = await db.users.count_documents({})
    verified_users = await db.users.count_documents({"verified": True})
    signups_24h = await db.users.count_documents({"created_at": {"$gte": last_24h}})
    logins_24h = await db.security_events.count_documents({"event": "login_success", "created_at": {"$gte": last_24h}})
    failed_logins_24h = await db.security_events.count_documents({"event": "login_failed", "created_at": {"$gte": last_24h}})
    lockouts_24h = await db.security_events.count_documents({"reason": "lockout_triggered", "created_at": {"$gte": last_24h}})
    open_reports = await db.reports.count_documents({"status": "open"})
    screenshots_7d = await db.screenshot_events.count_documents({"created_at": {"$gte": last_7d}})
    failed_verifications_7d = await db.verifications.count_documents({"verified": False, "created_at": {"$gte": last_7d}})
    active_sessions = len(manager.active)
    return {
        "total_users": total_users,
        "verified_users": verified_users,
        "signups_24h": signups_24h,
        "logins_24h": logins_24h,
        "failed_logins_24h": failed_logins_24h,
        "lockouts_24h": lockouts_24h,
        "open_reports": open_reports,
        "screenshots_7d": screenshots_7d,
        "failed_verifications_7d": failed_verifications_7d,
        "active_sessions": active_sessions,
    }


@router.get("/admin/users")
async def admin_users(q: Optional[str] = None, limit: int = 50, reveal: bool = False,
                      reason: Optional[str] = None, user: dict = Depends(require_staff)):
    if reveal and user.get("role") not in ("admin", "manager"):
        reveal = False
    if reveal and (not reason or len(reason) < 4):
        raise HTTPException(status_code=400, detail="A reason (min 4 chars) is required to reveal PII")
    query: dict = {}
    if q:
        q_clean = re.escape(q.strip().lower())
        query = {"$or": [{"username": {"$regex": q_clean}}, {"email": {"$regex": q_clean}}]}
    docs = await db.users.find(
        query,
        {"_id": 0, "password_hash": 0, "profile_image_base64": 0},
    ).sort("created_at", -1).to_list(limit)
    # Suspicious flagging: failed_attempts >= 3 or locked or >=3 verification fails in last 24h
    out = []
    last_24 = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    # Batch-fetch failed verification counts per user (aggregation), avoiding N+1.
    fails_map: dict = {}
    if docs:
        user_ids = [d["id"] for d in docs]
        agg = db.verifications.aggregate([
            {"$match": {"user_id": {"$in": user_ids}, "verified": False,
                        "created_at": {"$gte": last_24}}},
            {"$group": {"_id": "$user_id", "n": {"$sum": 1}}},
        ])
        async for row in agg:
            fails_map[row["_id"]] = int(row["n"])
    for d in docs:
        fails = fails_map.get(d["id"], 0)
        sus_reasons = []
        if int(d.get("failed_attempts", 0) or 0) >= 3:
            sus_reasons.append("failed_logins")
        if d.get("locked_until"):
            sus_reasons.append("locked")
        if fails >= 3:
            sus_reasons.append("verification_fails")
        masked = {
            **d,
            "email": d.get("email") if reveal else mask_email(d.get("email")),
            "suspicious": bool(sus_reasons),
            "suspicious_reasons": sus_reasons,
        }
        out.append(masked)
    if reveal:
        await log_admin_action(user, "users_reveal_pii", reason=reason)
    return out


@router.get("/admin/users/{user_id}")
async def admin_user_detail(user_id: str, reveal: bool = False, reason: Optional[str] = None,
                            user: dict = Depends(require_staff)):
    if reveal and user.get("role") not in ("admin", "manager"):
        reveal = False
    if reveal and (not reason or len(reason) < 4):
        raise HTTPException(status_code=400, detail="A reason (min 4 chars) is required to reveal PII")
    d = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not d:
        raise HTTPException(status_code=404, detail="User not found")
    locations = await db.location_logs.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    events = await db.security_events.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(30).to_list(30)
    if not reveal:
        d["email"] = mask_email(d.get("email"))
        for loc in locations:
            loc["ip"] = mask_ip(loc.get("ip"))
        for ev in events:
            ev["ip"] = mask_ip(ev.get("ip"))
    await log_admin_action(user, "user_detail_view", target_id=user_id, target_kind="user",
                           reason=reason if reveal else None)
    return {"user": d, "locations": locations, "events": events}


@router.get("/admin/reports")
async def admin_reports(status_filter: str = "open", limit: int = 100, user: dict = Depends(require_staff)):
    q = {} if status_filter == "all" else {"status": status_filter}
    docs = await db.reports.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


@router.post("/admin/reports/{report_id}/resolve")
async def admin_resolve_report(report_id: str, body: AdminResolveReportIn,
                               user: dict = Depends(require_staff)):
    if body.action not in ("dismiss", "warn", "block_user"):
        raise HTTPException(status_code=400, detail="Invalid action")
    rep = await db.reports.find_one({"id": report_id}, {"_id": 0})
    if not rep:
        raise HTTPException(status_code=404, detail="Report not found")
    new_status = "resolved" if body.action != "block_user" else "actioned_block"
    await db.reports.update_one(
        {"id": report_id},
        {"$set": {"status": new_status, "resolution": body.action,
                  "resolution_notes": body.notes, "resolved_by": user["id"],
                  "resolved_at": now_iso()}},
    )
    if body.action == "block_user":
        # globally suspend the reported user
        await db.users.update_one(
            {"id": rep["target_id"]},
            {"$set": {"suspended": True, "suspended_at": now_iso(), "suspended_reason": body.notes or "Report action"}},
        )
    await log_admin_action(user, f"report_{body.action}", target_id=report_id, target_kind="report",
                           reason=body.notes)
    return {"resolved": True, "status": new_status}


@router.get("/admin/security-events")
async def admin_security_events(limit: int = 100, event: Optional[str] = None,
                                reveal: bool = False, reason: Optional[str] = None,
                                user: dict = Depends(require_staff)):
    if reveal and user.get("role") not in ("admin", "manager"):
        reveal = False
    q: dict = {}
    if event:
        q["event"] = event
    docs = await db.security_events.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    if not reveal:
        for d in docs:
            d["email"] = mask_email(d.get("email"))
            d["ip"] = mask_ip(d.get("ip"))
    else:
        await log_admin_action(user, "security_events_reveal_pii", reason=reason)
    return docs


@router.get("/admin/screenshot-events")
async def admin_screenshot_events(limit: int = 100, user: dict = Depends(require_staff)):
    docs = await db.screenshot_events.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


@router.get("/admin/audit-log")
async def admin_audit_log(limit: int = 100, user: dict = Depends(require_admin)):
    docs = await db.admin_audit.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


@router.post("/admin/roles")
async def admin_set_role(body: AdminRoleIn, user: dict = Depends(require_admin)):
    if body.role not in ("user", "admin", "manager", "supervisor"):
        raise HTTPException(status_code=400, detail="Invalid role")
    if body.user_id == user["id"] and body.role != "admin":
        raise HTTPException(status_code=400, detail="You cannot demote yourself")
    target = await db.users.find_one({"id": body.user_id}, {"_id": 0, "id": 1, "username": 1})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"id": body.user_id}, {"$set": {"role": body.role}})
    await log_admin_action(user, "set_role", target_id=body.user_id, target_kind="user",
                           reason=f"role={body.role}")
    return {"updated": True}


@router.post("/admin/users/{user_id}/suspend")
async def admin_suspend_user(user_id: str, body: AdminResolveReportIn,
                             user: dict = Depends(require_staff)):
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"suspended": True, "suspended_at": now_iso(),
                  "suspended_reason": body.notes or "Staff action"}},
    )
    await log_admin_action(user, "suspend_user", target_id=user_id, target_kind="user",
                           reason=body.notes)
    return {"suspended": True}


@router.post("/admin/users/{user_id}/unsuspend")
async def admin_unsuspend_user(user_id: str, user: dict = Depends(require_staff)):
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"suspended": False}, "$unset": {"suspended_at": "", "suspended_reason": ""}},
    )
    await log_admin_action(user, "unsuspend_user", target_id=user_id, target_kind="user")
    return {"unsuspended": True}
