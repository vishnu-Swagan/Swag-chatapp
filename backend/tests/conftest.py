import asyncio
import os
import sys

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")


@pytest.fixture(scope="session", autouse=True)
def _reset_test_state():
    """Reset alice/bob and clear chat/social state before the test run."""
    from db import db  # noqa: WPS433

    async def _reset():
        await db.users.update_many(
            {"username": {"$in": ["alice_test", "bob_test"]}},
            {"$set": {"blocked_users": [], "suspended": False,
                      "failed_attempts": 0, "locked_until": None}},
        )
        await db.friendships.delete_many({})
        await db.requests.delete_many({})
        await db.messages.delete_many({})
        await db.reports.delete_many({})

    asyncio.get_event_loop().run_until_complete(_reset()) if False else asyncio.run(_reset())
    yield


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def ws_url():
    return WS_URL


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    r.raise_for_status()
    return r.json()


@pytest.fixture(scope="session")
def alice():
    return _login("alice@test.com", "Test@1234")


@pytest.fixture(scope="session")
def bob():
    return _login("bob@test.com", "Test@1234")


@pytest.fixture
def alice_headers(alice):
    return {"Authorization": f"Bearer {alice['token']}", "Content-Type": "application/json"}


@pytest.fixture
def bob_headers(bob):
    return {"Authorization": f"Bearer {bob['token']}", "Content-Type": "application/json"}
