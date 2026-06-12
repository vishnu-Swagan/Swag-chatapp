"""Seed pre-verified test users (idempotent). Run: python seed_test_users.py"""
import asyncio
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import bcrypt
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / '.env')

USERS = [
    {"email": "alice@test.com", "username": "alice_test", "password": "Test@1234", "role": "user"},
    {"email": "bob@test.com", "username": "bob_test", "password": "Test@1234", "role": "user"},
    {"email": "admin@swagchat.app", "username": "admin", "password": "Admin@1234", "role": "admin"},
    {"email": "manager@swagchat.app", "username": "manager", "password": "Manager@1234", "role": "manager"},
    {"email": "supervisor@swagchat.app", "username": "supervisor", "password": "Supervisor@1234", "role": "supervisor"},
]


async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    for u in USERS:
        existing = await db.users.find_one({"email": u["email"]})
        if existing:
            await db.users.update_one(
                {"email": u["email"]},
                {"$set": {"verified": True, "role": u["role"]}, "$setOnInsert": {}},
            )
            print(f"{u['username']} exists -> ensured verified, role={u['role']}")
            continue
        pw_hash = bcrypt.hashpw(u["password"].encode(), bcrypt.gensalt()).decode()
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": u["email"],
            "username": u["username"],
            "password_hash": pw_hash,
            "verified": True,
            "country": "US",
            "id_type": "Passport",
            "role": u["role"],
            "blocked_users": [],
            "delete_for_everyone_enabled": True,
            "failed_attempts": 0,
            "locked_until": None,
            "consent": {
                "terms_version": "2026-06-01",
                "accepted_at": datetime.now(timezone.utc).isoformat(),
                "ip": "127.0.0.1",
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        print(f"created {u['username']} (role={u['role']}, verified)")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
