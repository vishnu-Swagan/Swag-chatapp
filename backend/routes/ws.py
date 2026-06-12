"""WebSocket: realtime chat events + WebRTC call signaling relay."""
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from db import db
from security import decode_token
from utils import now_iso
from ws_manager import manager

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    try:
        user_id = decode_token(token)
    except Exception:
        await websocket.close(code=4001)
        return
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        await websocket.close(code=4001)
        return
    await manager.connect(user_id, websocket)
    await db.users.update_one({"id": user_id}, {"$set": {"last_seen": now_iso()}})
    try:
        while True:
            data = await websocket.receive_json()
            mtype = data.get("type")
            if mtype == "ping":
                await websocket.send_json({"type": "pong"})
            elif mtype == "typing":
                to = data.get("to")
                if to:
                    await manager.send(to, {
                        "type": "typing",
                        "from": user_id,
                        "typing": bool(data.get("typing", True)),
                    })
            elif mtype in ("call:request", "call:accept", "call:reject", "call:end",
                           "rtc:offer", "rtc:answer", "rtc:ice"):
                to = data.get("to")
                if not to:
                    continue
                out = {**data, "from": {"id": user_id, "username": user["username"]}}
                delivered = await manager.send(to, out)
                if mtype == "call:request" and not delivered:
                    await websocket.send_json({"type": "call:unavailable", "to": to})
    except WebSocketDisconnect:
        manager.disconnect(user_id)
    except Exception:
        manager.disconnect(user_id)
    finally:
        await db.users.update_one({"id": user_id}, {"$set": {"last_seen": now_iso()}})
