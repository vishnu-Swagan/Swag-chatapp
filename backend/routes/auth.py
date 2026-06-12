"""Auth: signup, login, me, location logging, GDPR account deletion."""
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request

from config import EMAIL_RE, LOCK_MINUTES, LOCK_THRESHOLD, TERMS_VERSION, USERNAME_RE
from db import db
from models import LocationIn, LoginIn, SignupIn
from security import create_token, get_current_user
from utils import (geoip_lookup, get_client_ip, log_security_event, now_iso,
                   password_policy_error, public_user)

router = APIRouter()


@router.get("/")
async def root():
    return {"message": "Swag Chat API", "status": "ok"}


@router.post("/auth/signup")
async def signup(body: SignupIn, request: Request):
    email = body.email.strip().lower()
    username = body.username.strip().lower()
    if not body.accepted_terms:
        raise HTTPException(status_code=400, detail="You must accept the Terms & Privacy Policy")
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Invalid email address")
    if not USERNAME_RE.match(username):
        raise HTTPException(status_code=400, detail="Username must be 3-20 chars: lowercase letters, numbers, underscores")
    policy_error = password_policy_error(body.password)
    if policy_error:
        raise HTTPException(status_code=400, detail=policy_error)
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    if await db.users.find_one({"username": username}):
        raise HTTPException(status_code=400, detail="Username is taken")
    pw_hash = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    signup_ip = get_client_ip(request)
    signup_geo = await geoip_lookup(signup_ip)
    signup_ua = request.headers.get("user-agent", "")
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "username": username,
        "password_hash": pw_hash,
        "verified": False,
        "country": None,
        "id_type": None,
        "role": "user",
        "blocked_users": [],
        "delete_for_everyone_enabled": True,
        "failed_attempts": 0,
        "locked_until": None,
        "consent": {
            "terms_version": TERMS_VERSION,
            "accepted_at": now_iso(),
            "ip": signup_ip,
        },
        "signup_ip": signup_ip,
        "signup_user_agent": signup_ua,
        "signup_geo": signup_geo,
        "last_login_ip": signup_ip,
        "last_login_geo": signup_geo,
        "last_login_user_agent": signup_ua,
        "last_login_at": now_iso(),
        "created_at": now_iso(),
    }
    await db.users.insert_one({**user})
    await log_security_event("signup", user["id"], email, request, success=True)
    return {"token": create_token(user["id"]), "user": public_user(user)}


@router.post("/auth/login")
async def login(body: LoginIn, request: Request):
    email = body.email.strip().lower()
    now = datetime.now(timezone.utc)
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        await log_security_event("login_failed", None, email, request, reason="user_not_found")
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    locked_until = user.get("locked_until")
    if locked_until:
        try:
            lu = datetime.fromisoformat(locked_until)
        except (TypeError, ValueError):
            lu = None
        if lu and lu > now:
            mins = int((lu - now).total_seconds() // 60) + 1
            await log_security_event("login_blocked", user["id"], email, request, reason="account_locked")
            raise HTTPException(
                status_code=429,
                detail=f"Account temporarily locked after failed attempts. Try again in {mins} min.",
            )
    if not bcrypt.checkpw(body.password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        failed = int(user.get("failed_attempts", 0) or 0) + 1
        update = {"failed_attempts": failed}
        reason = "invalid_password"
        if failed >= LOCK_THRESHOLD:
            update["locked_until"] = (now + timedelta(minutes=LOCK_MINUTES)).isoformat()
            update["failed_attempts"] = 0
            reason = "lockout_triggered"
        await db.users.update_one({"id": user["id"]}, {"$set": update})
        await log_security_event("login_failed", user["id"], email, request, reason=reason)
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    if user.get("suspended"):
        await log_security_event("login_blocked", user["id"], email, request, reason="suspended")
        raise HTTPException(status_code=403, detail="Account suspended. Contact support.")
    login_ip = get_client_ip(request)
    login_geo = await geoip_lookup(login_ip)
    login_ua = request.headers.get("user-agent", "")
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {
                "failed_attempts": 0,
                "locked_until": None,
                "last_login_at": now_iso(),
                "last_login_ip": login_ip,
                "last_login_geo": login_geo,
                "last_login_user_agent": login_ua,
            },
            "$push": {
                "login_history": {
                    "$each": [{
                        "at": now_iso(),
                        "ip": login_ip,
                        "geo": login_geo,
                        "user_agent": login_ua,
                    }],
                    "$slice": -50,  # keep last 50 logins
                },
            },
        },
    )
    await log_security_event("login_success", user["id"], email, request, success=True)
    return {"token": create_token(user["id"]), "user": public_user(user)}


@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@router.post("/security/location")
async def log_location(body: LocationIn, request: Request, user: dict = Depends(get_current_user)):
    if body.event not in ("signup", "login"):
        raise HTTPException(status_code=400, detail="Invalid event")
    await db.location_logs.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "event": body.event,
        "lat": body.lat,
        "lng": body.lng,
        "accuracy": body.accuracy,
        "source": "gps" if body.lat is not None and body.lng is not None else "ip",
        "ip": get_client_ip(request),
        "user_agent": request.headers.get("user-agent", ""),
        "created_at": now_iso(),
    })
    return {"logged": True}


@router.delete("/auth/account")
async def delete_account(request: Request, user: dict = Depends(get_current_user)):
    """GDPR-style right to erasure: removes the user and all personal data;
    security audit logs are anonymized instead of deleted."""
    uid = user["id"]
    await db.messages.delete_many({"$or": [{"sender_id": uid}, {"recipient_id": uid}]})
    await db.friendships.delete_many({"users": uid})
    await db.requests.delete_many({"$or": [{"from_id": uid}, {"to_id": uid}]})
    await db.verifications.delete_many({"user_id": uid})
    await db.location_logs.delete_many({"user_id": uid})
    await db.security_events.update_many(
        {"user_id": uid},
        {"$set": {"user_id": None, "email": None, "anonymized_at": now_iso()}},
    )
    await db.users.delete_one({"id": uid})
    await log_security_event("account_deleted", None, None, request, success=True)
    return {"deleted": True}
