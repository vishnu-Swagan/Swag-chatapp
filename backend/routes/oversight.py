"""Owner-only admin oversight & app-version management.

Endpoints (all admin-only):
- GET  /api/admin/users/{user_id}/dossier  full per-user dossier (account, verification docs, profile pic, recent media, IP history)
- GET  /api/admin/activity                 cross-system activity feed (signups, logins, verifications, statuses, reports)
- GET  /api/app/version                    PUBLIC: current/min version + force-update flag (called on app launch)
- POST /api/admin/app-version              UPDATE the current version policy (push update prompts to all installed clients)
- GET  /api/admin/app-version              READ current version policy
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from db import db
from security import get_current_user, require_admin
from utils import geoip_lookup, log_admin_action, now_iso

router = APIRouter()

# ---------- App version (public + admin) ----------

DEFAULT_VERSION_DOC = {
    "id": "current",
    "current_version": "1.0.0",
    "min_supported_version": "1.0.0",
    "force_update": False,
    "message": "",
    "release_notes": "",
    "ios_url": "https://apps.apple.com/",
    "android_url": "https://play.google.com/store",
    "updated_at": now_iso(),
}


class AppVersionIn(BaseModel):
    current_version: str = Field(min_length=1, max_length=24)
    min_supported_version: str = Field(min_length=1, max_length=24)
    force_update: bool = False
    message: Optional[str] = None
    release_notes: Optional[str] = None
    ios_url: Optional[str] = None
    android_url: Optional[str] = None


@router.get("/app/version")
async def get_app_version_public():
    """PUBLIC endpoint called by the mobile app on launch. No auth required."""
    doc = await db.app_config.find_one({"id": "current"}, {"_id": 0})
    if not doc:
        return DEFAULT_VERSION_DOC
    return doc


@router.get("/admin/app-version")
async def get_app_version_admin(user: dict = Depends(require_admin)):
    doc = await db.app_config.find_one({"id": "current"}, {"_id": 0})
    return doc or DEFAULT_VERSION_DOC


@router.post("/admin/app-version")
async def set_app_version(body: AppVersionIn, user: dict = Depends(require_admin)):
    payload = {
        "id": "current",
        "current_version": body.current_version,
        "min_supported_version": body.min_supported_version,
        "force_update": body.force_update,
        "message": body.message or "",
        "release_notes": body.release_notes or "",
        "ios_url": body.ios_url or DEFAULT_VERSION_DOC["ios_url"],
        "android_url": body.android_url or DEFAULT_VERSION_DOC["android_url"],
        "updated_at": now_iso(),
        "updated_by": user["username"],
    }
    await db.app_config.update_one({"id": "current"}, {"$set": payload}, upsert=True)
    await log_admin_action(user, "app_version_updated", target_kind="app_config",
                           reason=f"v{body.current_version} force={body.force_update}")
    return payload


# ---------- Dossier (admin-only) ----------

@router.get("/admin/users/{user_id}/dossier")
async def get_user_dossier(user_id: str, request: Request,
                           reveal: bool = False, reason: Optional[str] = None,
                           user: dict = Depends(require_admin)):
    """Full per-user dossier. PII (email, raw IP, verification photos) only returned
    when reveal=true AND a reason is provided. Every reveal is audit-logged."""
    if reveal and (not reason or len(reason) < 4):
        raise HTTPException(status_code=400, detail="A reason (>=4 chars) is required to reveal PII")

    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Verification docs (ID image + selfie) - sensitive
    verifs = await db.verifications.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(20)

    # Profile picture
    profile_image = target.get("profile_image_base64")

    # Recent uploaded media in chats
    media_msgs = await db.messages.find(
        {"sender_id": user_id, "type": {"$in": ["image", "video", "audio", "document"]}},
        {"_id": 0},
    ).sort("created_at", -1).limit(30).to_list(30)

    # Statuses posted
    statuses = await db.statuses.find(
        {"user_id": user_id}, {"_id": 0},
    ).sort("created_at", -1).limit(20).to_list(20)

    # Security events
    sec_events = await db.security_events.find(
        {"user_id": user_id}, {"_id": 0},
    ).sort("created_at", -1).limit(50).to_list(50)

    # Location logs (GPS coords from app)
    location_logs = await db.location_logs.find(
        {"user_id": user_id}, {"_id": 0},
    ).sort("created_at", -1).limit(50).to_list(50)

    # Reports filed by AND against this user
    reports_against = await db.reports.find(
        {"reported_id": user_id}, {"_id": 0},
    ).sort("created_at", -1).limit(50).to_list(50)
    reports_filed = await db.reports.find(
        {"reporter_id": user_id}, {"_id": 0},
    ).sort("created_at", -1).limit(50).to_list(50)

    # Friend count
    friend_count = await db.friendships.count_documents({"users": user_id})

    # Message volume
    sent_count = await db.messages.count_documents({"sender_id": user_id})
    received_count = await db.messages.count_documents({"recipient_id": user_id})

    # Scrub PII unless revealed
    def _scrub(d: dict, keys: list[str]):
        for k in keys:
            if k in d and d[k]:
                v = str(d[k])
                if "@" in v:
                    nm, dm = v.split("@", 1)
                    d[k] = f"{nm[:1]}{'*' * max(2, len(nm) - 1)}@{dm}"
                elif "." in v and any(c.isdigit() for c in v):
                    parts = v.split(".")
                    if len(parts) == 4:
                        d[k] = f"{parts[0]}.{parts[1]}.x.x"
        return d

    if not reveal:
        # Strip heavy/sensitive blobs
        target.pop("email", None)
        target.pop("signup_ip", None)
        target.pop("last_login_ip", None)
        target.pop("login_history", None)
        target.pop("consent", None)
        profile_image = None  # do not return raw photo unless revealed
        for v in verifs:
            v.pop("id_image_base64", None)
            v.pop("selfie_base64", None)
        for m in media_msgs:
            m.pop("image_base64", None)
            m.pop("video_base64", None)
            m.pop("audio_base64", None)
            m.pop("document_base64", None)
        for ev in sec_events:
            _scrub(ev, ["ip", "email"])

    if reveal:
        await log_admin_action(
            user, "dossier_revealed",
            target_id=user_id, target_kind="user", reason=reason,
        )

    return {
        "user": target,
        "stats": {
            "friends": friend_count,
            "messages_sent": sent_count,
            "messages_received": received_count,
            "statuses_count": len(statuses),
            "verification_attempts": len(verifs),
            "reports_against_count": len(reports_against),
            "reports_filed_count": len(reports_filed),
        },
        "verifications": verifs,
        "profile_image_base64": profile_image,
        "media_messages": media_msgs,
        "statuses": statuses,
        "security_events": sec_events,
        "location_logs": location_logs,
        "reports_against": reports_against,
        "reports_filed": reports_filed,
        "revealed": reveal,
    }


# ---------- Activity feed (admin-only) ----------

@router.get("/admin/activity")
async def admin_activity(limit: int = 100,
                         since: Optional[str] = None,
                         user: dict = Depends(require_admin)):
    """Cross-system chronological feed of signups, logins, verifications, statuses, reports."""
    limit = min(max(limit, 10), 300)
    since_dt = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
        except ValueError:
            since_dt = None

    events: list[dict] = []

    # Signups & logins (security_events)
    sec_filter: dict = {"event": {"$in": ["signup", "login_success", "login_failed", "account_deleted"]}}
    if since_dt:
        sec_filter["created_at"] = {"$gte": since_dt.isoformat()}
    sec = await db.security_events.find(sec_filter, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    for e in sec:
        events.append({
            "kind": e["event"],
            "at": e["created_at"],
            "user_id": e.get("user_id"),
            "email": e.get("email"),
            "ip": e.get("ip"),
            "user_agent": e.get("user_agent"),
            "success": e.get("success"),
            "reason": e.get("reason"),
        })

    # Verifications
    vf_filter: dict = {}
    if since_dt:
        vf_filter["created_at"] = {"$gte": since_dt.isoformat()}
    vfs = await db.verifications.find(vf_filter, {"_id": 0, "id_image_base64": 0, "selfie_base64": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    for v in vfs:
        events.append({
            "kind": "verification",
            "at": v["created_at"],
            "user_id": v["user_id"],
            "verified": v.get("verified"),
            "country": v.get("country"),
            "id_type": v.get("id_type"),
            "face_match": v.get("face_match"),
        })

    # Statuses posted
    st_filter: dict = {}
    if since_dt:
        st_filter["created_at"] = {"$gte": since_dt.isoformat()}
    sts = await db.statuses.find(st_filter, {"_id": 0, "image_base64": 0, "video_base64": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    for s in sts:
        events.append({
            "kind": "status",
            "at": s["created_at"],
            "user_id": s["user_id"],
            "status_type": s["type"],
            "status_id": s["id"],
        })

    # Reports filed
    rep_filter: dict = {}
    if since_dt:
        rep_filter["created_at"] = {"$gte": since_dt.isoformat()}
    reps = await db.reports.find(rep_filter, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    for r in reps:
        events.append({
            "kind": "report",
            "at": r["created_at"],
            "user_id": r.get("reporter_id"),
            "reported_id": r.get("reported_id"),
            "category": r.get("category"),
            "status": r.get("status"),
            "report_id": r.get("id"),
        })

    # Resolve usernames in one batch
    user_ids = list({e.get("user_id") for e in events if e.get("user_id")} |
                    {e.get("reported_id") for e in events if e.get("reported_id")})
    users = await db.users.find(
        {"id": {"$in": user_ids}},
        {"_id": 0, "id": 1, "username": 1},
    ).to_list(len(user_ids)) if user_ids else []
    umap = {u["id"]: u["username"] for u in users}
    for e in events:
        if e.get("user_id"):
            e["username"] = umap.get(e["user_id"])
        if e.get("reported_id"):
            e["reported_username"] = umap.get(e["reported_id"])

    events.sort(key=lambda e: e.get("at") or "", reverse=True)
    return {"events": events[:limit]}


@router.post("/admin/geoip-lookup")
async def admin_geoip_lookup(ip: str, user: dict = Depends(require_admin)):
    """On-demand GeoIP lookup for an arbitrary IP (cached)."""
    return await geoip_lookup(ip)
