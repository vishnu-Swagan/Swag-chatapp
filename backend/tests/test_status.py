"""Iteration 5 — Status (Stories) feature tests.

Covers: POST/GET/DELETE /api/status, /api/status/feed, /view, /viewers.
Friendship between alice and bob is set up idempotently before each scenario.
"""
import base64 as _b64
import os
import time
import uuid

import pytest
import requests


BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")


# -------- helpers --------
def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _ensure_friends(alice_token: str, bob_token: str, bob_username: str = "bob_test"):
    """Make sure alice ↔ bob are friends. Idempotent."""
    # Search style used by other tests: ?username= and "is_friend" flag
    s = requests.get(f"{BASE_URL}/api/users/search?username={bob_username}",
                     headers=_h(alice_token), timeout=15).json()
    target = next((u for u in s.get("users", []) if u["username"] == bob_username), None)
    if target and target.get("is_friend"):
        return
    # send request alice -> bob (may 400 if pending)
    requests.post(f"{BASE_URL}/api/requests",
                  json={"to_username": bob_username},
                  headers=_h(alice_token), timeout=15)
    # bob lists incoming requests and accepts (endpoint returns {incoming: [...]})
    inc = requests.get(f"{BASE_URL}/api/requests",
                       headers=_h(bob_token), timeout=15).json()
    items = inc.get("incoming") or inc.get("requests") or inc.get("items") or []
    for req in items:
        rid = req.get("id")
        if not rid:
            continue
        requests.post(f"{BASE_URL}/api/requests/{rid}/respond",
                      json={"action": "accept"},
                      headers=_h(bob_token), timeout=15)


def _cleanup_statuses(token: str):
    feed = requests.get(f"{BASE_URL}/api/status/feed",
                        headers=_h(token), timeout=15).json()
    for it in feed.get("items", []):
        if it.get("is_self"):
            for s in it.get("statuses", []):
                requests.delete(f"{BASE_URL}/api/status/{s['id']}",
                                headers=_h(token), timeout=15)


# Tiny base64 payloads — content doesn't matter for our validation tests.
TINY_IMG = _b64.b64encode(b"\xff\xd8\xff\xe0" + b"X" * 200).decode()
TINY_VID = _b64.b64encode(b"\x00\x00\x00\x18ftypmp42" + b"V" * 400).decode()


@pytest.fixture(scope="module", autouse=True)
def _setup(alice, bob):
    _ensure_friends(alice["token"], bob["token"])
    _cleanup_statuses(alice["token"])
    _cleanup_statuses(bob["token"])
    yield
    _cleanup_statuses(alice["token"])
    _cleanup_statuses(bob["token"])


# ---------------- create / validation ----------------
class TestStatusCreate:
    def test_create_text_status_200(self, alice_headers):
        body = {"type": "text", "text": "Hello status", "background": "#7C3AED"}
        r = requests.post(f"{BASE_URL}/api/status", json=body, headers=alice_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["type"] == "text"
        assert d["text"] == "Hello status"
        assert d["background"] == "#7C3AED"
        assert d["viewers"] == []
        assert "id" in d and "expires_at" in d
        # heavy fields stripped
        assert "image_base64" not in d or d.get("image_base64") is None
        assert "video_base64" not in d or d.get("video_base64") is None
        # cleanup this one so other tests have a clean slate
        requests.delete(f"{BASE_URL}/api/status/{d['id']}",
                        headers=alice_headers, timeout=15)

    def test_text_status_missing_text_400(self, alice_headers):
        r = requests.post(f"{BASE_URL}/api/status",
                          json={"type": "text"}, headers=alice_headers, timeout=15)
        assert r.status_code == 400

    def test_text_status_too_long_400(self, alice_headers):
        r = requests.post(f"{BASE_URL}/api/status",
                          json={"type": "text", "text": "x" * 701},
                          headers=alice_headers, timeout=15)
        assert r.status_code == 400

    def test_image_status_200(self, alice_headers):
        r = requests.post(f"{BASE_URL}/api/status",
                          json={"type": "image", "image_base64": TINY_IMG, "caption": "hi"},
                          headers=alice_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["type"] == "image"
        assert d.get("caption") == "hi"
        requests.delete(f"{BASE_URL}/api/status/{d['id']}",
                        headers=alice_headers, timeout=15)

    def test_image_status_missing_400(self, alice_headers):
        r = requests.post(f"{BASE_URL}/api/status",
                          json={"type": "image"}, headers=alice_headers, timeout=15)
        assert r.status_code == 400

    def test_video_status_200(self, alice_headers):
        r = requests.post(f"{BASE_URL}/api/status",
                          json={"type": "video", "video_base64": TINY_VID, "duration_ms": 5000},
                          headers=alice_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["type"] == "video"
        assert d.get("duration_ms") == 5000
        requests.delete(f"{BASE_URL}/api/status/{d['id']}",
                        headers=alice_headers, timeout=15)

    def test_video_status_missing_400(self, alice_headers):
        r = requests.post(f"{BASE_URL}/api/status",
                          json={"type": "video"}, headers=alice_headers, timeout=15)
        assert r.status_code == 400

    def test_invalid_type_400(self, alice_headers):
        r = requests.post(f"{BASE_URL}/api/status",
                          json={"type": "gif", "text": "x"},
                          headers=alice_headers, timeout=15)
        assert r.status_code == 400


# ---------------- feed / view / viewers / delete ----------------
class TestStatusFeedAndViews:
    @pytest.fixture(scope="class")
    def alice_statuses(self, alice, bob):
        """Create two statuses by alice (text + image), return their ids."""
        _ensure_friends(alice["token"], bob["token"])
        _cleanup_statuses(alice["token"])
        r1 = requests.post(f"{BASE_URL}/api/status",
                           json={"type": "text", "text": "First status",
                                 "background": "#0F172A"},
                           headers=_h(alice["token"]), timeout=15)
        assert r1.status_code == 200, r1.text
        time.sleep(1.1)  # ensure different created_at ordering
        r2 = requests.post(f"{BASE_URL}/api/status",
                           json={"type": "text", "text": "Second status",
                                 "background": "#7C3AED"},
                           headers=_h(alice["token"]), timeout=15)
        assert r2.status_code == 200, r2.text
        ids = [r1.json()["id"], r2.json()["id"]]
        yield ids
        for sid in ids:
            requests.delete(f"{BASE_URL}/api/status/{sid}",
                            headers=_h(alice["token"]), timeout=15)

    def test_feed_as_alice_self_seen(self, alice_headers, alice_statuses):
        r = requests.get(f"{BASE_URL}/api/status/feed",
                         headers=alice_headers, timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        self_entry = next((it for it in items if it["is_self"]), None)
        assert self_entry is not None
        assert self_entry["has_unseen"] is False
        # oldest first within an owner's statuses
        ts = [s["created_at"] for s in self_entry["statuses"]]
        assert ts == sorted(ts), f"statuses not oldest-first: {ts}"
        # 2 created in fixture
        assert len(self_entry["statuses"]) >= 2

    def test_feed_as_bob_has_unseen(self, bob_headers, alice_statuses):
        r = requests.get(f"{BASE_URL}/api/status/feed",
                         headers=bob_headers, timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        alice_entry = next((it for it in items
                            if it["user"]["username"] == "alice_test"), None)
        assert alice_entry is not None, items
        assert alice_entry["is_self"] is False
        assert alice_entry["has_unseen"] is True
        assert all(s["seen"] is False for s in alice_entry["statuses"])

    def test_mark_viewed_then_feed_seen(self, bob_headers, alice_statuses):
        sid = alice_statuses[0]
        r = requests.post(f"{BASE_URL}/api/status/{sid}/view",
                          headers=bob_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("viewed") is True
        feed = requests.get(f"{BASE_URL}/api/status/feed",
                            headers=bob_headers, timeout=15).json()
        alice_entry = next((it for it in feed["items"]
                            if it["user"]["username"] == "alice_test"), None)
        s = next((x for x in alice_entry["statuses"] if x["id"] == sid), None)
        assert s is not None and s["seen"] is True

    def test_viewers_403_for_non_author(self, bob_headers, alice_statuses):
        sid = alice_statuses[0]
        r = requests.get(f"{BASE_URL}/api/status/{sid}/viewers",
                         headers=bob_headers, timeout=15)
        assert r.status_code == 403

    def test_viewers_for_author_includes_bob(self, alice_headers, bob, alice_statuses):
        sid = alice_statuses[0]
        r = requests.get(f"{BASE_URL}/api/status/{sid}/viewers",
                         headers=alice_headers, timeout=15)
        assert r.status_code == 200, r.text
        viewers = r.json()["viewers"]
        assert any(v["username"] == "bob_test" for v in viewers), viewers

    def test_delete_403_for_non_author(self, bob_headers, alice_statuses):
        sid = alice_statuses[1]
        r = requests.delete(f"{BASE_URL}/api/status/{sid}",
                            headers=bob_headers, timeout=15)
        assert r.status_code == 403

    def test_delete_by_author_then_404(self, alice, alice_headers):
        """Create a fresh status, delete it, and confirm 404 on subsequent GET."""
        r = requests.post(f"{BASE_URL}/api/status",
                          json={"type": "text", "text": "to delete",
                                "background": "#059669"},
                          headers=alice_headers, timeout=15)
        sid = r.json()["id"]
        d = requests.delete(f"{BASE_URL}/api/status/{sid}",
                            headers=alice_headers, timeout=15)
        assert d.status_code == 200
        assert d.json().get("deleted") is True
        g = requests.get(f"{BASE_URL}/api/status/{sid}",
                         headers=alice_headers, timeout=15)
        assert g.status_code == 404


# ---------------- non-friend visibility (charlie) ----------------
class TestStatusNonFriend403:
    def test_non_friend_403_on_get(self, alice, alice_headers):
        # Create charlie fresh (signup + verify shortcut via DB if needed)
        charlie_email = f"charlie_{uuid.uuid4().hex[:6]}@test.com"
        charlie_user = f"charlie_{uuid.uuid4().hex[:6]}"
        sr = requests.post(f"{BASE_URL}/api/auth/signup",
                           json={"email": charlie_email,
                                 "username": charlie_user,
                                 "password": "Test@1234",
                                 "accepted_terms": True}, timeout=15)
        if sr.status_code not in (200, 201):
            pytest.skip(f"Signup failed: {sr.status_code} {sr.text}")
        charlie_token = sr.json().get("token")
        # Mark charlie verified directly in DB so we can hit the status endpoint
        # (the API otherwise returns 403 "verification required").
        try:
            from pymongo import MongoClient
            mongo_url = os.environ.get("MONGO_URL")
            db_name = os.environ.get("DB_NAME") or "test_database"
            if not mongo_url:
                # Try reading backend/.env
                from dotenv import dotenv_values
                env = dotenv_values("/app/backend/.env")
                mongo_url = env.get("MONGO_URL")
                db_name = env.get("DB_NAME") or db_name
            client = MongoClient(mongo_url)
            client[db_name].users.update_one(
                {"username": charlie_user}, {"$set": {"verified": True}}
            )
            client.close()
        except Exception as e:
            pytest.skip(f"Could not flip charlie.verified: {e}")

        # Alice posts a fresh status
        r = requests.post(f"{BASE_URL}/api/status",
                          json={"type": "text", "text": "private to friends",
                                "background": "#DC2626"},
                          headers=alice_headers, timeout=15)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        try:
            g = requests.get(f"{BASE_URL}/api/status/{sid}",
                             headers=_h(charlie_token), timeout=15)
            assert g.status_code == 403, g.text
        finally:
            requests.delete(f"{BASE_URL}/api/status/{sid}",
                            headers=alice_headers, timeout=15)
