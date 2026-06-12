"""Identity verification: countries list + AI selfie/ID matching (GPT-4o vision)."""
import json
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from config import (COUNTRIES, COUNTRY_NAMES, OPENAI_API_KEY,
                    MAX_VERIFY_ATTEMPTS_PER_DAY, MIN_FACE_CONFIDENCE)
from db import db
from models import VerificationIn
from security import get_current_user
from utils import logger, now_iso

router = APIRouter()


def _data_uri(b64: str) -> str:
    if not b64:
        return ""
    if b64.startswith("data:"):
        return b64
    mime = "image/png" if b64.startswith("iVBOR") else "image/jpeg"
    return f"data:{mime};base64,{b64}"


@router.get("/verification/countries")
async def get_countries(user: dict = Depends(get_current_user)):
    return COUNTRIES


async def run_ai_face_verification(id_b64: str, selfie_b64: str, country: str, id_type: str) -> dict:
    from openai import AsyncOpenAI
    country_name = COUNTRY_NAMES.get(country, country)
    prompt = (
        f"You are a strict identity verification system. You are given two images.\n"
        f"Image 1: a government-issued ID document, claimed to be a \"{id_type}\" from {country_name}.\n"
        f"Image 2: a live selfie of a person.\n\n"
        f"Tasks:\n"
        f"1. Verify Image 1 looks like a genuine government ID document of the claimed type and contains a visible face photo. Reject photocopies, screenshots, photographed screens, or digitally altered documents.\n"
        f"2. Verify Image 2 contains a clear, live human face. Reject if it appears to be a photo of a printed photo, a photo of a screen, a mask, or otherwise spoofed.\n"
        f"3. Compare the face on the ID document with the selfie and decide whether they are the same person. Be strict: similar-looking different people must NOT match.\n"
        f"4. Set spoof_suspected=true if either image shows any sign of spoofing, tampering or re-capture.\n\n"
        f"Respond ONLY with valid JSON, no markdown, exactly in this shape:\n"
        f'{{"id_valid": true, "selfie_valid": true, "face_match": true, "spoof_suspected": false, "confidence": 85, "reason": "short explanation"}}'
    )
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    resp = await client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "You are an identity verification system. You always answer with strict JSON only."},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": _data_uri(id_b64)}},
                    {"type": "image_url", "image_url": {"url": _data_uri(selfie_b64)}},
                ],
            },
        ],
        max_tokens=300,
    )
    text = (resp.choices[0].message.content or "").strip()
    text = re.sub(r"^```(json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            return json.loads(m.group(0))
        raise


@router.post("/verification/submit")
async def submit_verification(body: VerificationIn, user: dict = Depends(get_current_user)):
    if user.get("verified"):
        return {"verified": True, "reason": "Already verified"}
    if not body.id_image_base64 or not body.selfie_base64:
        raise HTTPException(status_code=400, detail="Both ID image and selfie are required")
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    attempts_today = await db.verifications.count_documents(
        {"user_id": user["id"], "created_at": {"$gte": since}}
    )
    if attempts_today >= MAX_VERIFY_ATTEMPTS_PER_DAY:
        raise HTTPException(status_code=429, detail="Daily verification attempt limit reached. Please try again in 24 hours.")
    try:
        result = await run_ai_face_verification(body.id_image_base64, body.selfie_base64, body.country, body.id_type)
    except Exception as e:
        logger.error(f"AI verification failed: {e}")
        raise HTTPException(status_code=502, detail="Verification service unavailable, please try again")

    id_valid = bool(result.get("id_valid"))
    selfie_valid = bool(result.get("selfie_valid"))
    face_match = bool(result.get("face_match"))
    spoof_suspected = bool(result.get("spoof_suspected"))
    confidence = int(result.get("confidence", 0) or 0)
    reason = str(result.get("reason", ""))
    verified = (id_valid and selfie_valid and face_match
                and not spoof_suspected and confidence >= MIN_FACE_CONFIDENCE)

    await db.verifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "country": body.country,
        "id_type": body.id_type,
        "id_valid": id_valid,
        "selfie_valid": selfie_valid,
        "face_match": face_match,
        "spoof_suspected": spoof_suspected,
        "confidence": confidence,
        "reason": reason,
        "verified": verified,
        "created_at": now_iso(),
    })
    if verified:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"verified": True, "country": body.country, "id_type": body.id_type, "verified_at": now_iso()}},
        )
    if not reason:
        reason = "Faces match" if verified else "Could not confirm identity match"
    return {"verified": verified, "confidence": confidence, "reason": reason,
            "id_valid": id_valid, "selfie_valid": selfie_valid, "face_match": face_match}
