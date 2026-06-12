import logging
import re
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import Request

from db import db

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("swagchat")


_GEOIP_CACHE: dict = {}


async def geoip_lookup(ip: str) -> dict:
    """Free GeoIP lookup via ip-api.com (no key, 45 req/min).
    Returns {country, region, city, isp, lat, lon} or {} on failure.
    Cached in-process so repeated lookups for the same IP are free.
    """
    if not ip or ip in ("unknown", "127.0.0.1", "::1") or ip.startswith("10.") or ip.startswith("192.168."):
        return {"country": "Local/Private", "city": "—"}
    if ip in _GEOIP_CACHE:
        return _GEOIP_CACHE[ip]
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"http://ip-api.com/json/{ip}",
                                 params={"fields": "status,country,regionName,city,isp,lat,lon"})
            data = r.json()
            if data.get("status") != "success":
                _GEOIP_CACHE[ip] = {}
                return {}
            result = {
                "country": data.get("country"),
                "region": data.get("regionName"),
                "city": data.get("city"),
                "isp": data.get("isp"),
                "lat": data.get("lat"),
                "lon": data.get("lon"),
            }
            _GEOIP_CACHE[ip] = result
            return result
    except Exception as e:
        logger.warning(f"geoip lookup failed for {ip}: {e}")
        return {}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def mask_email(email):
    if not email or "@" not in email:
        return email
    name, dom = email.split("@", 1)
    keep = name[0] if name else "*"
    return f"{keep}{'*' * max(2, len(name) - 1)}@{dom}"


def mask_ip(ip):
    if not ip:
        return ip
    parts = ip.split(".")
    if len(parts) == 4:
        return f"{parts[0]}.{parts[1]}.x.x"
    if ":" in ip:
        return ip.split(":")[0] + ":***"
    return ip[:6] + "***"


def public_user(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "username": doc["username"],
        "email": doc.get("email"),
        "verified": doc.get("verified", False),
        "country": doc.get("country"),
        "role": doc.get("role", "user"),
        "created_at": doc.get("created_at"),
        "profile_image_base64": doc.get("profile_image_base64"),
    }


def password_policy_error(pw: str):
    if len(pw) < 8:
        return "Password must be at least 8 characters"
    if not re.search(r"[A-Z]", pw):
        return "Password must include an uppercase letter"
    if not re.search(r"[a-z]", pw):
        return "Password must include a lowercase letter"
    if not re.search(r"\d", pw):
        return "Password must include a number"
    if not re.search(r"[^\w\s]", pw):
        return "Password must include a symbol (e.g. !@#$)"
    return None


def get_client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def log_security_event(event: str, user_id, email, request: Request,
                             success: bool = False, reason=None) -> None:
    try:
        await db.security_events.insert_one({
            "id": str(uuid.uuid4()),
            "event": event,
            "user_id": user_id,
            "email": email,
            "ip": get_client_ip(request),
            "user_agent": request.headers.get("user-agent", ""),
            "success": success,
            "reason": reason,
            "created_at": now_iso(),
        })
    except Exception as e:
        logger.warning(f"security event log failed: {e}")


async def log_admin_action(actor, action, target_id=None, target_kind=None, reason=None):
    try:
        await db.admin_audit.insert_one({
            "id": str(uuid.uuid4()),
            "actor_id": actor.get("id"),
            "actor_username": actor.get("username"),
            "actor_role": actor.get("role"),
            "action": action,
            "target_id": target_id,
            "target_kind": target_kind,
            "reason": reason,
            "created_at": now_iso(),
        })
    except Exception as e:
        logger.warning(f"admin audit log failed: {e}")
