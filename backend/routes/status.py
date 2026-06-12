"""Status / Stories endpoints — 24h ephemeral posts (text / image / video).

Storage: MongoDB `statuses` collection with a TTL index on `expires_at`.
Visibility: only the author's friends (and the author themselves) can view a
status. The author always sees their viewer list.
"""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from db import db
from models import StatusIn
from security import are_friends, require_verified
from utils import now_iso
from ws_manager import manager

router = APIRouter()

STATUS_TTL_HOURS = 24


def _strip_heavy(doc: dict) -> dict:
    out = {**doc}
    out.pop("image_base64", None)
    out.pop("video_base64", None)
    return out


@router.post("/status")
async def create_status(body: StatusIn, user: dict = Depends(require_verified)):
    t = body.type
    if t not in ("text", "image", "video"):
        raise HTTPException(status_code=400, detail="Invalid status type")
    if t == "text":
        if not body.text or not body.text.strip():
            raise HTTPException(status_code=400, detail="Text is required")
        if len(body.text) > 700:
            raise HTTPException(status_code=400, detail="Text status too long (700 chars max)")
    elif t == "image":
        if not body.image_base64:
            raise HTTPException(status_code=400, detail="Image is required")
        if len(body.image_base64) > 2_500_000:
            raise HTTPException(status_code=400, detail="Image too large (~1.8MB max)")
    elif t == "video":
        if not body.video_base64:
            raise HTTPException(status_code=400, detail="Video is required")
        if len(body.video_base64) > 4_500_000:
            raise HTTPException(status_code=400, detail="Video too large (~3.3MB max). Try a shorter clip.")

    expires_at = datetime.now(timezone.utc) + timedelta(hours=STATUS_TTL_HOURS)
    status = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": t,
        "text": (body.text or None) if t == "text" else None,
        "background": body.background if t == "text" else None,
        "image_base64": body.image_base64 if t == "image" else None,
        "video_base64": body.video_base64 if t == "video" else None,
        "caption": body.caption if t in ("image", "video") else None,
        "duration_ms": body.duration_ms if t == "video" else None,
        "viewers": [],
        "created_at": now_iso(),
        "expires_at": expires_at,
    }
    await db.statuses.insert_one({**status})
    # Push to friends
    friendships = await db.friendships.find({"users": user["id"]}, {"_id": 0}).to_list(500)
    friend_ids = [next(u for u in f["users"] if u != user["id"]) for f in friendships]
    for fid in friend_ids:
        await manager.send(fid, {
            "type": "status:new",
            "by": {"id": user["id"], "username": user["username"]},
            "status_id": status["id"],
        })
    out = {**status}
    out["expires_at"] = expires_at.isoformat()
    return _strip_heavy(out)


@router.get("/status/feed")
async def status_feed(user: dict = Depends(require_verified)):
    """Return one entry per friend (and self) who has active statuses."""
    uid = user["id"]
    friendships = await db.friendships.find({"users": uid}, {"_id": 0}).to_list(500)
    blocked = set(user.get("blocked_users") or [])
    friend_ids = [next(u for u in f["users"] if u != uid) for f in friendships]
    friend_ids = [f for f in friend_ids if f not in blocked]
    visible_ids = friend_ids + [uid]
    if not visible_ids:
        return {"items": []}
    statuses = await db.statuses.find(
        {"user_id": {"$in": visible_ids},
         "expires_at": {"$gt": datetime.now(timezone.utc)}},
        {"_id": 0, "image_base64": 0, "video_base64": 0},
    ).sort("created_at", -1).to_list(500)
    if not statuses:
        return {"items": []}
    user_ids = list({s["user_id"] for s in statuses})
    users = await db.users.find(
        {"id": {"$in": user_ids}},
        {"_id": 0, "id": 1, "username": 1, "profile_image_base64": 1},
    ).to_list(len(user_ids))
    user_map = {u["id"]: u for u in users}
    grouped: dict = {}
    for s in statuses:
        owner = grouped.setdefault(s["user_id"], {
            "user": user_map.get(s["user_id"], {"id": s["user_id"], "username": "unknown"}),
            "is_self": s["user_id"] == uid,
            "statuses": [],
            "has_unseen": False,
        })
        seen = uid in (s.get("viewers") or [])
        owner["statuses"].append({
            "id": s["id"],
            "type": s["type"],
            "text": s.get("text"),
            "background": s.get("background"),
            "caption": s.get("caption"),
            "duration_ms": s.get("duration_ms"),
            "created_at": s["created_at"],
            "seen": seen,
            "viewers_count": len(s.get("viewers") or []) if s["user_id"] == uid else None,
        })
        if not seen and s["user_id"] != uid:
            owner["has_unseen"] = True
    # Order: self first (if has any), then unseen-first, then most recent
    items = list(grouped.values())
    items.sort(
        key=lambda g: (
            not g["is_self"],
            not g["has_unseen"],
            -max(
                datetime.fromisoformat(s["created_at"].replace("Z", "+00:00")
                                       if "Z" in s["created_at"] else s["created_at"]).timestamp()
                for s in g["statuses"]
            ),
        )
    )
    # Reverse each user's statuses so oldest plays first
    for it in items:
        it["statuses"].reverse()
    return {"items": items}


@router.get("/status/{status_id}")
async def get_status(status_id: str, user: dict = Depends(require_verified)):
    s = await db.statuses.find_one({"id": status_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Status not found")
    if s["user_id"] != user["id"] and not await are_friends(user["id"], s["user_id"]):
        raise HTTPException(status_code=403, detail="Not visible")
    # TTL check (defensive — Mongo TTL is eventually-consistent)
    if s.get("expires_at") and s["expires_at"] <= datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Status expired")
    return s


@router.post("/status/{status_id}/view")
async def mark_viewed(status_id: str, user: dict = Depends(require_verified)):
    s = await db.statuses.find_one({"id": status_id}, {"_id": 0, "user_id": 1, "viewers": 1})
    if not s:
        raise HTTPException(status_code=404, detail="Status not found")
    if s["user_id"] == user["id"]:
        return {"viewed": True}
    if user["id"] in (s.get("viewers") or []):
        return {"viewed": True}
    await db.statuses.update_one(
        {"id": status_id},
        {"$addToSet": {"viewers": user["id"]}},
    )
    await manager.send(s["user_id"], {
        "type": "status:viewed",
        "status_id": status_id,
        "by": user["id"],
    })
    return {"viewed": True}


@router.get("/status/{status_id}/viewers")
async def get_viewers(status_id: str, user: dict = Depends(require_verified)):
    s = await db.statuses.find_one({"id": status_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Status not found")
    if s["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the author can see viewers")
    viewer_ids = s.get("viewers") or []
    if not viewer_ids:
        return {"viewers": []}
    users = await db.users.find(
        {"id": {"$in": viewer_ids}},
        {"_id": 0, "id": 1, "username": 1, "profile_image_base64": 1},
    ).to_list(len(viewer_ids))
    return {"viewers": users}


@router.delete("/status/{status_id}")
async def delete_status(status_id: str, user: dict = Depends(require_verified)):
    s = await db.statuses.find_one({"id": status_id}, {"_id": 0, "user_id": 1})
    if not s:
        raise HTTPException(status_code=404, detail="Status not found")
    if s["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="You can only delete your own status")
    await db.statuses.delete_one({"id": status_id})
    return {"deleted": True}
