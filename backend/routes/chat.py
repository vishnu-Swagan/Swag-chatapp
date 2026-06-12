"""Chats and messages: listing, sending all media types, reactions, replies, read receipts, delete-for-everyone, view-once."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from config import DELETE_FOR_EVERYONE_WINDOW_MIN
from db import db
from models import (DeleteForEveryoneIn, ImageViewedIn, MessageIn,
                    ProfileImageIn, ReactionIn, TypingIn)
from security import are_friends, is_blocked_either_way, require_verified
from utils import now_iso
from ws_manager import manager

router = APIRouter()


def _strip_heavy_media(msg: dict) -> dict:
    """Remove large base64 blobs for chat-list previews."""
    out = {**msg}
    for k in ("image_base64", "video_base64", "audio_base64", "document_base64"):
        out.pop(k, None)
    return out


@router.get("/chats")
async def list_chats(user: dict = Depends(require_verified)):
    uid = user["id"]
    blocked = set(user.get("blocked_users") or [])
    friendships = await db.friendships.find({"users": uid}, {"_id": 0}).to_list(500)
    # 1) Resolve friend IDs (filtering my-blocked list)
    friend_ids = []
    fid_to_since = {}
    for f in friendships:
        fid = next(u for u in f["users"] if u != uid)
        if fid in blocked:
            continue
        friend_ids.append(fid)
        fid_to_since[fid] = f["created_at"]
    if not friend_ids:
        return []
    # 2) Batch-fetch all friend user docs (excluding heavy fields we don't need)
    friend_docs = await db.users.find(
        {"id": {"$in": friend_ids}},
        {"_id": 0, "id": 1, "username": 1, "verified": 1,
         "profile_image_base64": 1, "blocked_users": 1, "last_seen": 1},
    ).to_list(len(friend_ids))
    friend_map = {f["id"]: f for f in friend_docs}
    # 3) Build chats in original order, skipping if friend has blocked me
    chats = []
    msg_projection = {
        "_id": 0,
        "image_base64": 0, "video_base64": 0,
        "audio_base64": 0, "document_base64": 0,
    }
    for fid in friend_ids:
        friend = friend_map.get(fid)
        if not friend:
            continue
        if uid in (friend.get("blocked_users") or []):
            continue
        last = await db.messages.find_one(
            {"$or": [{"sender_id": uid, "recipient_id": fid}, {"sender_id": fid, "recipient_id": uid}]},
            msg_projection,
            sort=[("created_at", -1)],
        )
        unread = await db.messages.count_documents({
            "sender_id": fid, "recipient_id": uid,
            "status": {"$ne": "read"}, "deleted_for_everyone": {"$ne": True},
        })
        chats.append({
            "friend": {
                "id": friend["id"],
                "username": friend["username"],
                "verified": friend.get("verified", False),
                "profile_image_base64": friend.get("profile_image_base64"),
            },
            "last_message": last,
            "unread": unread,
            "since": fid_to_since[fid],
            "online": fid in manager.active,
            "last_seen": friend.get("last_seen"),
        })
    chats.sort(key=lambda c: (c["last_message"]["created_at"] if c["last_message"] else c["since"]), reverse=True)
    return chats


@router.get("/messages/{friend_id}")
async def get_messages(friend_id: str, limit: int = 50, user: dict = Depends(require_verified)):
    if not await are_friends(user["id"], friend_id):
        raise HTTPException(status_code=403, detail="You are not connected with this user")
    msgs = await db.messages.find(
        {"$or": [{"sender_id": user["id"], "recipient_id": friend_id},
                 {"sender_id": friend_id, "recipient_id": user["id"]}]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(limit)
    out = []
    for m in msgs:
        if m.get("deleted_for_everyone"):
            for k in ("text", "image_base64", "video_base64", "audio_base64", "document_base64"):
                m[k] = None
        if m.get("view_once") and m.get("viewed_at") and m.get("recipient_id") == user["id"]:
            m["image_base64"] = None
        out.append(m)
    return out


async def _validate_media_type(body: MessageIn) -> dict:
    """Validates the message body for its declared type and returns the base record."""
    t = body.type
    base = {
        "type": t,
        "text": (body.text or None) if t == "text" else (body.text.strip() if body.text else None),
        "image_base64": body.image_base64 if t == "image" else None,
        "video_base64": body.video_base64 if t == "video" else None,
        "audio_base64": body.audio_base64 if t == "audio" else None,
        "document_base64": body.document_base64 if t == "document" else None,
        "document_name": body.document_name if t == "document" else None,
        "document_mime": body.document_mime if t == "document" else None,
        "document_size": body.document_size if t == "document" else None,
        "duration_ms": body.duration_ms if t in ("audio", "video") else None,
        "waveform": body.waveform if t == "audio" else None,
        "latitude": body.latitude if t == "location" else None,
        "longitude": body.longitude if t == "location" else None,
        "location_label": body.location_label if t == "location" else None,
        "view_once": bool(body.view_once and t == "image"),
        "reply_to_id": body.reply_to_id or None,
    }
    if t == "text":
        if not body.text or not body.text.strip():
            raise HTTPException(status_code=400, detail="Message text is required")
    elif t == "image":
        if not body.image_base64:
            raise HTTPException(status_code=400, detail="Image data is required")
    elif t == "video":
        if not body.video_base64:
            raise HTTPException(status_code=400, detail="Video data is required")
    elif t == "audio":
        if not body.audio_base64:
            raise HTTPException(status_code=400, detail="Audio data is required")
    elif t == "document":
        if not body.document_base64 or not body.document_name:
            raise HTTPException(status_code=400, detail="Document data and name are required")
    elif t == "location":
        if body.latitude is None or body.longitude is None:
            raise HTTPException(status_code=400, detail="Latitude and longitude are required")
    else:
        raise HTTPException(status_code=400, detail="Invalid message type")
    return base


@router.post("/messages")
async def send_message(body: MessageIn, user: dict = Depends(require_verified)):
    if not await are_friends(user["id"], body.to_user_id):
        raise HTTPException(status_code=403, detail="You are not connected with this user")
    if await is_blocked_either_way(user["id"], body.to_user_id):
        raise HTTPException(status_code=403, detail="You cannot message this user")
    recipient = await db.users.find_one({"id": body.to_user_id}, {"_id": 0, "suspended": 1})
    if recipient and recipient.get("suspended"):
        raise HTTPException(status_code=403, detail="This user is currently suspended")

    base = await _validate_media_type(body)

    # If replying, fetch a snippet for the quoted preview.
    reply_preview = None
    if base["reply_to_id"]:
        original = await db.messages.find_one(
            {"id": base["reply_to_id"]},
            {"_id": 0, "image_base64": 0, "video_base64": 0, "audio_base64": 0, "document_base64": 0},
        )
        if original and (
            original.get("sender_id") in (user["id"], body.to_user_id)
            and original.get("recipient_id") in (user["id"], body.to_user_id)
        ):
            reply_preview = {
                "id": original["id"],
                "sender_id": original["sender_id"],
                "type": original.get("type"),
                "text": (original.get("text") or "")[:140],
                "document_name": original.get("document_name"),
            }

    msg = {
        "id": str(uuid.uuid4()),
        "sender_id": user["id"],
        "recipient_id": body.to_user_id,
        **base,
        "reply_preview": reply_preview,
        "reactions": {},
        "viewed_at": None,
        "deleted_for_everyone": False,
        "status": "sent",
        "created_at": now_iso(),
    }
    await db.messages.insert_one({**msg})
    delivered = await manager.send(body.to_user_id, {"type": "message:new", "message": msg})
    if delivered:
        await db.messages.update_one({"id": msg["id"]}, {"$set": {"status": "delivered"}})
        msg["status"] = "delivered"
    return msg


@router.post("/messages/react")
async def toggle_reaction(body: ReactionIn, user: dict = Depends(require_verified)):
    msg = await db.messages.find_one({"id": body.message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if user["id"] not in (msg.get("sender_id"), msg.get("recipient_id")):
        raise HTTPException(status_code=403, detail="Not your conversation")
    reactions = dict(msg.get("reactions") or {})
    current = reactions.get(user["id"])
    if current == body.emoji:
        reactions.pop(user["id"], None)
        action = "removed"
    else:
        reactions[user["id"]] = body.emoji
        action = "added"
    await db.messages.update_one({"id": body.message_id}, {"$set": {"reactions": reactions}})
    other = msg["recipient_id"] if msg["sender_id"] == user["id"] else msg["sender_id"]
    await manager.send(other, {
        "type": "message:reaction",
        "message_id": body.message_id,
        "by": user["id"],
        "emoji": body.emoji,
        "action": action,
        "reactions": reactions,
    })
    return {"reactions": reactions, "action": action}


@router.post("/typing")
async def signal_typing(body: TypingIn, user: dict = Depends(require_verified)):
    if not await are_friends(user["id"], body.to_user_id):
        return {"sent": False}
    if await is_blocked_either_way(user["id"], body.to_user_id):
        return {"sent": False}
    await manager.send(body.to_user_id, {
        "type": "typing",
        "from": user["id"],
        "typing": bool(body.typing),
    })
    return {"sent": True}


@router.post("/profile/image")
async def upload_profile_image(body: ProfileImageIn, user: dict = Depends(require_verified)):
    if not body.image_base64 or len(body.image_base64) > 2_500_000:
        raise HTTPException(status_code=400, detail="Profile image must be <= ~1.8MB")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"profile_image_base64": body.image_base64, "profile_image_updated_at": now_iso()}},
    )
    return {"updated": True}


@router.delete("/profile/image")
async def remove_profile_image(user: dict = Depends(require_verified)):
    await db.users.update_one(
        {"id": user["id"]},
        {"$unset": {"profile_image_base64": "", "profile_image_updated_at": ""}},
    )
    return {"removed": True}


@router.get("/profile/image/{user_id}")
async def get_profile_image(user_id: str, user: dict = Depends(require_verified)):
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "profile_image_base64": 1, "username": 1})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return {"username": u.get("username"), "profile_image_base64": u.get("profile_image_base64")}


@router.post("/chats/{friend_id}/read")
async def mark_read(friend_id: str, user: dict = Depends(require_verified)):
    result = await db.messages.update_many(
        {"sender_id": friend_id, "recipient_id": user["id"], "status": {"$ne": "read"}},
        {"$set": {"status": "read"}},
    )
    if result.modified_count:
        await manager.send(friend_id, {"type": "messages:read", "by": user["id"]})
    return {"marked": result.modified_count}


@router.post("/messages/delete-for-everyone")
async def delete_for_everyone(body: DeleteForEveryoneIn, user: dict = Depends(require_verified)):
    if not user.get("delete_for_everyone_enabled", True):
        raise HTTPException(status_code=403, detail="Delete-for-everyone is disabled in your settings")
    msg = await db.messages.find_one({"id": body.message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg["sender_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="You can only delete your own messages")
    if msg.get("deleted_for_everyone"):
        return {"deleted": True}
    try:
        sent_at = datetime.fromisoformat(msg["created_at"])
        if sent_at.tzinfo is None:
            sent_at = sent_at.replace(tzinfo=timezone.utc)
        age_min = (datetime.now(timezone.utc) - sent_at).total_seconds() / 60.0
    except (ValueError, TypeError, KeyError):
        age_min = DELETE_FOR_EVERYONE_WINDOW_MIN + 1
    if age_min > DELETE_FOR_EVERYONE_WINDOW_MIN:
        raise HTTPException(status_code=400, detail=f"Cannot delete after {DELETE_FOR_EVERYONE_WINDOW_MIN} minutes")
    await db.messages.update_one(
        {"id": body.message_id},
        {"$set": {
            "deleted_for_everyone": True,
            "text": None, "image_base64": None, "video_base64": None,
            "audio_base64": None, "document_base64": None,
            "deleted_at": now_iso(),
        }},
    )
    await manager.send(msg["recipient_id"], {
        "type": "message:deleted",
        "message_id": body.message_id,
        "by": user["id"],
    })
    return {"deleted": True}


@router.post("/messages/image-viewed")
async def mark_image_viewed(body: ImageViewedIn, user: dict = Depends(require_verified)):
    msg = await db.messages.find_one({"id": body.message_id}, {"_id": 0})
    if not msg or msg["recipient_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Message not found")
    if not msg.get("view_once"):
        return {"viewed": True}
    if msg.get("viewed_at"):
        return {"viewed": True}
    await db.messages.update_one(
        {"id": body.message_id},
        {"$set": {"viewed_at": now_iso(), "image_base64": None}},
    )
    await manager.send(msg["sender_id"], {
        "type": "message:viewed",
        "message_id": body.message_id,
    })
    return {"viewed": True}
