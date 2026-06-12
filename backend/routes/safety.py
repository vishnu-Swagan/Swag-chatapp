"""Safety: block/unblock/report, screenshot events, user settings."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request

from db import db
from models import BlockIn, ReportIn, ScreenshotEventIn
from security import are_friends, get_current_user
from utils import get_client_ip, now_iso
from ws_manager import manager

router = APIRouter()


@router.post("/safety/block")
async def block_user(body: BlockIn, user: dict = Depends(get_current_user)):
    if body.target_user_id == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot block yourself")
    target = await db.users.find_one({"id": body.target_user_id}, {"_id": 0, "id": 1, "username": 1})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one(
        {"id": user["id"]},
        {"$addToSet": {"blocked_users": body.target_user_id}},
    )
    return {"blocked": True, "username": target.get("username")}


@router.post("/safety/unblock")
async def unblock_user(body: BlockIn, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": user["id"]},
        {"$pull": {"blocked_users": body.target_user_id}},
    )
    return {"unblocked": True}


@router.get("/safety/blocked")
async def list_blocked(user: dict = Depends(get_current_user)):
    ids = user.get("blocked_users") or []
    if not ids:
        return []
    docs = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "username": 1, "verified": 1}).to_list(500)
    return docs


@router.post("/safety/report")
async def report_user(body: ReportIn, request: Request, user: dict = Depends(get_current_user)):
    if body.target_user_id == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot report yourself")
    target = await db.users.find_one({"id": body.target_user_id}, {"_id": 0, "id": 1, "username": 1})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    report = {
        "id": str(uuid.uuid4()),
        "reporter_id": user["id"],
        "reporter_username": user["username"],
        "target_id": target["id"],
        "target_username": target["username"],
        "category": body.category,
        "reason": body.reason,
        "status": "open",
        "ip": get_client_ip(request),
        "user_agent": request.headers.get("user-agent", ""),
        "created_at": now_iso(),
    }
    await db.reports.insert_one({**report})
    # Auto-block the reported user from contacting the reporter
    await db.users.update_one(
        {"id": user["id"]},
        {"$addToSet": {"blocked_users": target["id"]}},
    )
    return {"reported": True, "auto_blocked": True}


@router.post("/safety/screenshot")
async def screenshot_event(body: ScreenshotEventIn, request: Request, user: dict = Depends(get_current_user)):
    # Validate chat_with — must be an existing friend; otherwise drop the field
    # to prevent WS-spoof of arbitrary users.
    chat_with = None
    if body.chat_with and await are_friends(user["id"], body.chat_with):
        chat_with = body.chat_with
    await db.screenshot_events.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "username": user["username"],
        "context": body.context,
        "chat_with": chat_with,
        "message_id": body.message_id,
        "ip": get_client_ip(request),
        "created_at": now_iso(),
    })
    if chat_with:
        await manager.send(chat_with, {
            "type": "safety:screenshot",
            "by": {"id": user["id"], "username": user["username"]},
            "context": body.context,
        })
    return {"logged": True}


@router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    return {
        "delete_for_everyone_enabled": user.get("delete_for_everyone_enabled", True),
    }


@router.patch("/settings")
async def patch_settings(body: dict, user: dict = Depends(get_current_user)):
    updates = {}
    if "delete_for_everyone_enabled" in body:
        updates["delete_for_everyone_enabled"] = bool(body["delete_for_everyone_enabled"])
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    return {"updated": True, **updates}
