"""Communities & Groups: multi-user chat. A group message mirrors a 1:1
message but carries group_id instead of recipient_id. Realtime fan-out pushes
each new message to every online member over the existing WebSocket manager."""
import secrets
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from db import db
from models import (GroupCreateIn, GroupEditIn, GroupJoinIn, GroupMemberAddIn,
                    GroupMessageIn, GroupRoleIn)
from security import get_current_user, is_blocked_either_way, require_verified
from utils import now_iso
from ws_manager import manager

router = APIRouter()

MEDIA_FIELDS = (
    "image_base64", "video_base64", "audio_base64", "document_base64",
)
LIGHT_PROJECTION = {"_id": 0, "image_base64": 0, "video_base64": 0,
                    "audio_base64": 0, "document_base64": 0}


# ---------- helpers ----------

async def _membership(group_id: str, user_id: str) -> Optional[dict]:
    return await db.group_members.find_one(
        {"group_id": group_id, "user_id": user_id}, {"_id": 0}
    )


async def require_member(group_id: str, user_id: str) -> dict:
    m = await _membership(group_id, user_id)
    if not m:
        raise HTTPException(status_code=403, detail="You are not a member of this group")
    return m


async def require_group_role(group_id: str, user_id: str, roles: set) -> dict:
    m = await require_member(group_id, user_id)
    if m["role"] not in roles:
        raise HTTPException(status_code=403, detail="You do not have permission for this action")
    return m


async def _fanout(group_id: str, payload: dict, exclude: Optional[str] = None) -> None:
    """Push a payload to every online member of the group."""
    members = await db.group_members.find(
        {"group_id": group_id}, {"_id": 0, "user_id": 1}
    ).to_list(5000)
    for mem in members:
        if mem["user_id"] == exclude:
            continue
        await manager.send(mem["user_id"], payload)


def _public_group(g: dict, my_role: Optional[str] = None) -> dict:
    out = {
        "id": g["id"],
        "type": g.get("type", "group"),
        "name": g["name"],
        "description": g.get("description", ""),
        "avatar_base64": g.get("avatar_base64"),
        "owner_id": g["owner_id"],
        "member_count": g.get("member_count", 0),
        "is_public": g.get("is_public", False),
        "join_code": g.get("join_code"),
        "settings": g.get("settings", {"who_can_send": "all", "who_can_add": "all"}),
        "created_at": g.get("created_at"),
    }
    if my_role is not None:
        out["my_role"] = my_role
    return out


# ---------- group CRUD ----------

@router.post("/groups")
async def create_group(body: GroupCreateIn, user: dict = Depends(require_verified)):
    if body.type not in ("group", "community"):
        raise HTTPException(status_code=400, detail="type must be 'group' or 'community'")
    gid = str(uuid.uuid4())
    group = {
        "id": gid,
        "type": body.type,
        "name": body.name.strip(),
        "description": (body.description or "").strip(),
        "avatar_base64": body.avatar_base64,
        "owner_id": user["id"],
        "member_count": 1,
        "is_public": bool(body.is_public),
        "join_code": secrets.token_urlsafe(6)[:8],
        "settings": {"who_can_send": "all", "who_can_add": "all"},
        "created_at": now_iso(),
    }
    await db.groups.insert_one({**group})
    await db.group_members.insert_one({
        "id": str(uuid.uuid4()),
        "group_id": gid,
        "user_id": user["id"],
        "role": "owner",
        "joined_at": now_iso(),
        "muted": False,
    })
    return _public_group(group, my_role="owner")


@router.get("/groups")
async def my_groups(user: dict = Depends(require_verified)):
    memberships = await db.group_members.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).to_list(1000)
    role_by_gid = {m["group_id"]: m for m in memberships}
    gids = list(role_by_gid.keys())
    if not gids:
        return []
    groups = await db.groups.find({"id": {"$in": gids}}, {"_id": 0}).to_list(len(gids))
    out = []
    for g in groups:
        mem = role_by_gid[g["id"]]
        last = await db.messages.find_one(
            {"group_id": g["id"], "deleted_for_everyone": {"$ne": True}},
            LIGHT_PROJECTION, sort=[("created_at", -1)],
        )
        item = _public_group(g, my_role=mem["role"])
        item["last_message"] = last
        item["muted"] = mem.get("muted", False)
        out.append(item)
    out.sort(key=lambda c: (c["last_message"]["created_at"] if c["last_message"]
                            else c["created_at"]), reverse=True)
    return out


@router.get("/groups/discover")
async def discover_groups(limit: int = 50, user: dict = Depends(require_verified)):
    """Public communities the user can browse and join."""
    mine = await db.group_members.find(
        {"user_id": user["id"]}, {"_id": 0, "group_id": 1}
    ).to_list(1000)
    mine_ids = {m["group_id"] for m in mine}
    groups = await db.groups.find(
        {"is_public": True}, {"_id": 0}
    ).sort("member_count", -1).limit(limit).to_list(limit)
    return [{**_public_group(g), "joined": g["id"] in mine_ids} for g in groups]


@router.get("/groups/{group_id}")
async def group_detail(group_id: str, user: dict = Depends(require_verified)):
    m = await require_member(group_id, user["id"])
    g = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    return _public_group(g, my_role=m["role"])


@router.patch("/groups/{group_id}")
async def edit_group(group_id: str, body: GroupEditIn, user: dict = Depends(require_verified)):
    await require_group_role(group_id, user["id"], {"owner", "admin"})
    updates = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.description is not None:
        updates["description"] = body.description.strip()
    if body.avatar_base64 is not None:
        updates["avatar_base64"] = body.avatar_base64
    if body.who_can_send in ("all", "admins"):
        updates["settings.who_can_send"] = body.who_can_send
    if body.who_can_add in ("all", "admins"):
        updates["settings.who_can_add"] = body.who_can_add
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.groups.update_one({"id": group_id}, {"$set": updates})
    g = await db.groups.find_one({"id": group_id}, {"_id": 0})
    await _fanout(group_id, {"type": "group:updated", "group": _public_group(g)})
    return _public_group(g)


@router.delete("/groups/{group_id}")
async def delete_group(group_id: str, user: dict = Depends(require_verified)):
    await require_group_role(group_id, user["id"], {"owner"})
    await _fanout(group_id, {"type": "group:deleted", "group_id": group_id})
    await db.group_members.delete_many({"group_id": group_id})
    await db.messages.delete_many({"group_id": group_id})
    await db.groups.delete_one({"id": group_id})
    return {"deleted": True}


# ---------- membership ----------

@router.post("/groups/{group_id}/join")
async def join_group(group_id: str, body: GroupJoinIn, user: dict = Depends(require_verified)):
    g = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if await _membership(group_id, user["id"]):
        raise HTTPException(status_code=400, detail="You are already a member")
    if not g.get("is_public"):
        if not body.join_code or body.join_code != g.get("join_code"):
            raise HTTPException(status_code=403, detail="A valid invite code is required to join")
    await db.group_members.insert_one({
        "id": str(uuid.uuid4()),
        "group_id": group_id,
        "user_id": user["id"],
        "role": "member",
        "joined_at": now_iso(),
        "muted": False,
    })
    await db.groups.update_one({"id": group_id}, {"$inc": {"member_count": 1}})
    await _fanout(group_id, {
        "type": "group:member_joined",
        "group_id": group_id,
        "user": {"id": user["id"], "username": user["username"]},
    }, exclude=user["id"])
    g = await db.groups.find_one({"id": group_id}, {"_id": 0})
    return _public_group(g, my_role="member")


@router.post("/groups/{group_id}/leave")
async def leave_group(group_id: str, user: dict = Depends(require_verified)):
    m = await require_member(group_id, user["id"])
    if m["role"] == "owner":
        raise HTTPException(status_code=400,
                            detail="Owner cannot leave. Transfer ownership or delete the group.")
    await db.group_members.delete_one({"group_id": group_id, "user_id": user["id"]})
    await db.groups.update_one({"id": group_id}, {"$inc": {"member_count": -1}})
    await _fanout(group_id, {"type": "group:member_left", "group_id": group_id,
                             "user_id": user["id"]})
    return {"left": True}


@router.get("/groups/{group_id}/members")
async def list_members(group_id: str, user: dict = Depends(require_verified)):
    await require_member(group_id, user["id"])
    members = await db.group_members.find({"group_id": group_id}, {"_id": 0}).to_list(5000)
    uids = [m["user_id"] for m in members]
    docs = await db.users.find(
        {"id": {"$in": uids}},
        {"_id": 0, "id": 1, "username": 1, "verified": 1, "profile_image_base64": 1},
    ).to_list(len(uids))
    umap = {d["id"]: d for d in docs}
    out = []
    for m in members:
        u = umap.get(m["user_id"], {})
        out.append({
            "user_id": m["user_id"],
            "username": u.get("username"),
            "verified": u.get("verified", False),
            "profile_image_base64": u.get("profile_image_base64"),
            "role": m["role"],
            "joined_at": m["joined_at"],
            "online": m["user_id"] in manager.active,
        })
    role_rank = {"owner": 0, "admin": 1, "member": 2}
    out.sort(key=lambda x: (role_rank.get(x["role"], 3), x.get("username") or ""))
    return out


@router.post("/groups/{group_id}/members")
async def add_member(group_id: str, body: GroupMemberAddIn,
                     user: dict = Depends(require_verified)):
    g = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    me = await require_member(group_id, user["id"])
    who_can_add = g.get("settings", {}).get("who_can_add", "all")
    if who_can_add == "admins" and me["role"] not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only admins can add members to this group")
    target = await db.users.find_one({"id": body.user_id}, {"_id": 0, "id": 1})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if await _membership(group_id, body.user_id):
        raise HTTPException(status_code=400, detail="User is already a member")
    if await is_blocked_either_way(user["id"], body.user_id):
        raise HTTPException(status_code=403, detail="You cannot add this user")
    await db.group_members.insert_one({
        "id": str(uuid.uuid4()),
        "group_id": group_id,
        "user_id": body.user_id,
        "role": "member",
        "joined_at": now_iso(),
        "muted": False,
    })
    await db.groups.update_one({"id": group_id}, {"$inc": {"member_count": 1}})
    await _fanout(group_id, {"type": "group:member_joined", "group_id": group_id,
                             "user": {"id": body.user_id}})
    return {"added": True}


@router.delete("/groups/{group_id}/members/{target_id}")
async def remove_member(group_id: str, target_id: str,
                        user: dict = Depends(require_verified)):
    await require_group_role(group_id, user["id"], {"owner", "admin"})
    target = await _membership(group_id, target_id)
    if not target:
        raise HTTPException(status_code=404, detail="User is not a member")
    if target["role"] == "owner":
        raise HTTPException(status_code=403, detail="Cannot remove the owner")
    await db.group_members.delete_one({"group_id": group_id, "user_id": target_id})
    await db.groups.update_one({"id": group_id}, {"$inc": {"member_count": -1}})
    await _fanout(group_id, {"type": "group:member_left", "group_id": group_id,
                             "user_id": target_id})
    await manager.send(target_id, {"type": "group:removed", "group_id": group_id})
    return {"removed": True}


@router.post("/groups/{group_id}/members/{target_id}/role")
async def set_member_role(group_id: str, target_id: str, body: GroupRoleIn,
                          user: dict = Depends(require_verified)):
    await require_group_role(group_id, user["id"], {"owner"})
    if body.role not in ("admin", "member"):
        raise HTTPException(status_code=400, detail="role must be 'admin' or 'member'")
    target = await _membership(group_id, target_id)
    if not target:
        raise HTTPException(status_code=404, detail="User is not a member")
    if target["role"] == "owner":
        raise HTTPException(status_code=403, detail="Cannot change the owner's role")
    await db.group_members.update_one(
        {"group_id": group_id, "user_id": target_id}, {"$set": {"role": body.role}}
    )
    return {"role": body.role}


@router.post("/groups/{group_id}/mute")
async def toggle_mute(group_id: str, user: dict = Depends(require_verified)):
    m = await require_member(group_id, user["id"])
    new_val = not m.get("muted", False)
    await db.group_members.update_one(
        {"group_id": group_id, "user_id": user["id"]}, {"$set": {"muted": new_val}}
    )
    return {"muted": new_val}


# ---------- group messages ----------

@router.get("/groups/{group_id}/messages")
async def group_messages(group_id: str, limit: int = 50,
                         user: dict = Depends(require_verified)):
    await require_member(group_id, user["id"])
    msgs = await db.messages.find(
        {"group_id": group_id}, {"_id": 0}
    ).sort("created_at", -1).limit(min(limit, 100)).to_list(min(limit, 100))
    msgs.reverse()
    # Attach sender usernames (groups show who sent each message)
    sender_ids = list({m["sender_id"] for m in msgs})
    docs = await db.users.find(
        {"id": {"$in": sender_ids}},
        {"_id": 0, "id": 1, "username": 1, "profile_image_base64": 1},
    ).to_list(len(sender_ids))
    umap = {d["id"]: d for d in docs}
    for m in msgs:
        s = umap.get(m["sender_id"], {})
        m["sender_username"] = s.get("username")
        m["sender_image"] = s.get("profile_image_base64")
    return msgs


@router.post("/groups/{group_id}/messages")
async def send_group_message(group_id: str, body: GroupMessageIn,
                             user: dict = Depends(require_verified)):
    g = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    me = await require_member(group_id, user["id"])
    who_can_send = g.get("settings", {}).get("who_can_send", "all")
    if who_can_send == "admins" and me["role"] not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only admins can send messages in this group")
    if body.type not in ("text", "image", "video", "audio", "location", "document"):
        raise HTTPException(status_code=400, detail="Invalid message type")

    reply_preview = None
    if body.reply_to_id:
        original = await db.messages.find_one(
            {"id": body.reply_to_id, "group_id": group_id}, LIGHT_PROJECTION
        )
        if original:
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
        "sender_username": user["username"],
        "sender_image": user.get("profile_image_base64"),
        "group_id": group_id,
        "recipient_id": None,
        "type": body.type,
        "text": body.text,
        "image_base64": body.image_base64,
        "video_base64": body.video_base64,
        "audio_base64": body.audio_base64,
        "document_base64": body.document_base64,
        "document_name": body.document_name,
        "document_mime": body.document_mime,
        "document_size": body.document_size,
        "duration_ms": body.duration_ms,
        "waveform": body.waveform,
        "latitude": body.latitude,
        "longitude": body.longitude,
        "location_label": body.location_label,
        "reply_preview": reply_preview,
        "reactions": {},
        "deleted_for_everyone": False,
        "status": "sent",
        "created_at": now_iso(),
    }
    await db.messages.insert_one({**msg})
    # Realtime fan-out to all other online members.
    await _fanout(group_id, {"type": "group:message", "message": msg},
                  exclude=user["id"])
    return msg


@router.post("/groups/{group_id}/read")
async def mark_group_read(group_id: str, user: dict = Depends(require_verified)):
    await require_member(group_id, user["id"])
    await db.group_members.update_one(
        {"group_id": group_id, "user_id": user["id"]},
        {"$set": {"last_read_at": now_iso()}},
    )
    return {"ok": True}
