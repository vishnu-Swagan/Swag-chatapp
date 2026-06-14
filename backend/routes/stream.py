"""Stream Video: mint per-user tokens so the mobile/web client can connect to
Stream's audio/video calling infrastructure.

The Stream API secret stays server-side only. Clients authenticate to our API
with their existing JWT, and we hand back a short-lived Stream user token plus
the public API key needed to initialize the Stream client."""
from fastapi import APIRouter, Depends, HTTPException

from config import STREAM_API_KEY, STREAM_API_SECRET, STREAM_TOKEN_TTL_SECONDS
from security import get_current_user

router = APIRouter()

# Lazily built so the app still boots if Stream env vars aren't set yet.
_stream_client = None


def _get_stream_client():
    global _stream_client
    if not STREAM_API_KEY or not STREAM_API_SECRET:
        raise HTTPException(status_code=503, detail="Calling is not configured")
    if _stream_client is None:
        from getstream import Stream
        _stream_client = Stream(api_key=STREAM_API_KEY, api_secret=STREAM_API_SECRET)
    return _stream_client


@router.post("/stream/token")
async def create_stream_token(user: dict = Depends(get_current_user)):
    """Return a short-lived Stream user token for the authenticated caller."""
    client = _get_stream_client()
    user_id = user["id"]
    token = client.create_token(user_id=user_id, expiration=STREAM_TOKEN_TTL_SECONDS)
    return {"token": token, "api_key": STREAM_API_KEY, "user_id": user_id}
