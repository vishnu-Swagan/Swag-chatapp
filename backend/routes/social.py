"""Social graph: username search + friend requests."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from db import db
from models import RequestIn, RequestRespondIn
from security import are_friends, is_blocked_either_way, require_verified
from utils import now_iso
from ws_manager import manager

router = APIRouter()


@router.get("/users/search")
async def search_user(username: str = Query(...), user: dict = Depends(require_verified)):
    target = await db.users.find_one({"username": username.strip().lower()}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="No user found with that exact username")
    if target["id"] == user["id"]:
        raise HTTPException(status_code=400, detail="That's your own username")
    if await is_blocked_either_way(user["id"], target["id"]):
        raise HTTPException(status_code=404, detail="No user found with that exact username")
    friends = await are_friends(user["id"], target["id"])
    pending = await db.requests.find_one({
        "status": "pending",
        "$or": [
            {"from_id": user["id"], "to_id": target["id"]},
            {"from_id": target["id"], "to_id": user["id"]},
        ],
    }, {"_id": 0})
    return {
        "id": target["id"],
        "username": target["username"],
        "verified": target.get("verified", False),
        "is_friend": friends,
        "pending_request": pending is not None,
        "pending_direction": (None if not pending else ("outgoing" if pending["from_id"] == user["id"] else "incoming")),
    }


@router.post("/requests")
async def send_request(body: RequestIn, user: dict = Depends(require_verified)):
    target = await db.users.find_one({"username": body.to_username.strip().lower()}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="No user found with that exact username")
    if target["id"] == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot send a request to yourself")
    if await is_blocked_either_way(user["id"], target["id"]):
        raise HTTPException(status_code=403, detail="You cannot contact this user")
    if await are_friends(user["id"], target["id"]):
        raise HTTPException(status_code=400, detail="You are already connected")
    existing = await db.requests.find_one({
        "status": "pending",
        "$or": [
            {"from_id": user["id"], "to_id": target["id"]},
            {"from_id": target["id"], "to_id": user["id"]},
        ],
    })
    if existing:
        raise HTTPException(status_code=400, detail="A request between you two is already pending")
    req = {
        "id": str(uuid.uuid4()),
        "from_id": user["id"],
        "from_username": user["username"],
        "to_id": target["id"],
        "to_username": target["username"],
        "status": "pending",
        "created_at": now_iso(),
    }
    await db.requests.insert_one({**req})
    await manager.send(target["id"], {"type": "request:new", "request": req})
    return req


@router.get("/requests")
async def list_requests(user: dict = Depends(require_verified)):
    incoming = await db.requests.find({"to_id": user["id"], "status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    outgoing = await db.requests.find({"from_id": user["id"], "status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"incoming": incoming, "outgoing": outgoing}


@router.post("/requests/{request_id}/respond")
async def respond_request(request_id: str, body: RequestRespondIn, user: dict = Depends(require_verified)):
    if body.action not in ("accept", "reject"):
        raise HTTPException(status_code=400, detail="Action must be accept or reject")
    req = await db.requests.find_one({"id": request_id, "to_id": user["id"], "status": "pending"}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    new_status = "accepted" if body.action == "accept" else "rejected"
    await db.requests.update_one({"id": request_id}, {"$set": {"status": new_status, "responded_at": now_iso()}})
    if body.action == "accept":
        if not await are_friends(req["from_id"], req["to_id"]):
            await db.friendships.insert_one({
                "id": str(uuid.uuid4()),
                "users": [req["from_id"], req["to_id"]],
                "created_at": now_iso(),
            })
        await manager.send(req["from_id"], {"type": "request:accepted", "by": {"id": user["id"], "username": user["username"]}})
    return {"status": new_status}
