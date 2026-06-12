from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import JWT_ALGO, JWT_SECRET, STAFF_ROLES, TOKEN_DAYS
from db import db

bearer = HTTPBearer()


def create_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> str:
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    return payload["sub"]


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    try:
        user_id = decode_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_verified(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("verified"):
        raise HTTPException(status_code=403, detail="Identity verification required")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


async def require_staff(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Staff role required")
    return user


async def are_friends(a: str, b: str) -> bool:
    f = await db.friendships.find_one({"users": {"$all": [a, b]}})
    return f is not None


async def is_blocked_either_way(a: str, b: str) -> bool:
    """True if a blocked b OR b blocked a."""
    u = await db.users.find_one(
        {"$or": [
            {"id": a, "blocked_users": b},
            {"id": b, "blocked_users": a},
        ]},
        {"_id": 0, "id": 1},
    )
    return u is not None
