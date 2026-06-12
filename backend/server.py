"""Swag Chat API — app assembly. Routes live in routes/, shared logic in
config.py, db.py, models.py, security.py, utils.py, ws_manager.py."""
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

from db import client, db
from routes import (admin, auth, chat, groups, oversight, safety, social,
                    status, verification, ws)

app = FastAPI(title="Swag Chat API")

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(verification.router, tags=["verification"])
api_router.include_router(social.router, tags=["social"])
api_router.include_router(chat.router, tags=["chat"])
api_router.include_router(groups.router, tags=["groups"])
api_router.include_router(status.router, tags=["status"])
api_router.include_router(safety.router, tags=["safety"])
api_router.include_router(admin.router, tags=["admin"])
api_router.include_router(oversight.router, tags=["oversight"])
api_router.include_router(ws.router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("username", unique=True)
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id")
    await db.messages.create_index([("sender_id", 1), ("recipient_id", 1), ("created_at", -1)])
    await db.messages.create_index([("recipient_id", 1), ("status", 1)])
    await db.messages.create_index("id")
    await db.messages.create_index([("group_id", 1), ("created_at", -1)])
    await db.groups.create_index("id", unique=True)
    await db.groups.create_index([("is_public", 1), ("member_count", -1)])
    await db.group_members.create_index([("group_id", 1), ("user_id", 1)], unique=True)
    await db.group_members.create_index("user_id")
    await db.requests.create_index([("to_id", 1), ("status", 1)])
    await db.friendships.create_index("users")
    await db.verifications.create_index([("user_id", 1), ("verified", 1), ("created_at", -1)])
    await db.reports.create_index([("status", 1), ("created_at", -1)])
    # Status TTL: documents are auto-removed when expires_at < now
    await db.statuses.create_index("expires_at", expireAfterSeconds=0)
    await db.statuses.create_index([("user_id", 1), ("created_at", -1)])


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
