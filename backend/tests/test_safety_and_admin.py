"""Swag Chat: Safety (block/report/view-once/delete-for-everyone/screenshot) + Admin CRM tests."""
import os
import uuid
import time

import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env", override=False)

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# A small PNG (1x1) base64 used for image messages
TINY_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII="


# ---------------- helpers ----------------
def _login(email, password, expected=200):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == expected, f"{email}->{r.status_code} {r.text}"
    return r.json() if r.status_code == 200 else r


def _hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


async def _reset_block_lists():
    cli = AsyncIOMotorClient(MONGO_URL)
    db = cli[DB_NAME]
    await db.users.update_many({}, {"$set": {"blocked_users": [], "delete_for_everyone_enabled": True}})
    await db.users.update_many({"email": "bob@test.com"}, {"$unset": {"suspended": "", "suspended_at": "", "suspended_reason": ""}})
    # ensure alice and bob are friends
    alice = await db.users.find_one({"email": "alice@test.com"})
    bob = await db.users.find_one({"email": "bob@test.com"})
    fr = await db.friendships.find_one({"users": {"$all": [alice["id"], bob["id"]]}})
    if not fr:
        import uuid as _uuid
        from datetime import datetime, timezone
        await db.friendships.insert_one({
            "id": str(_uuid.uuid4()),
            "users": [alice["id"], bob["id"]],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    cli.close()


@pytest.fixture(scope="module", autouse=True)
def _setup_module():
    asyncio.run(_reset_block_lists())


@pytest.fixture(scope="module")
def alice():
    return _login("alice@test.com", "Test@1234")


@pytest.fixture(scope="module")
def bob():
    return _login("bob@test.com", "Test@1234")


@pytest.fixture(scope="module")
def admin():
    return _login("admin@swagchat.app", "Admin@1234")


@pytest.fixture(scope="module")
def manager():
    return _login("manager@swagchat.app", "Manager@1234")


@pytest.fixture(scope="module")
def supervisor():
    return _login("supervisor@swagchat.app", "Supervisor@1234")


# ============================================================
# SIGNUP: Terms enforcement + happy path
# ============================================================
class TestSignupTerms:
    def test_signup_rejects_missing_terms(self):
        uname = f"trm_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/auth/signup",
                          json={"email": f"{uname}@t.com", "username": uname,
                                "password": "Password1!"})
        assert r.status_code == 400
        assert "terms" in r.json()["detail"].lower()

    def test_signup_succeeds_with_terms_and_strong_pw(self):
        uname = f"trm_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/auth/signup",
                          json={"email": f"{uname}@t.com", "username": uname,
                                "password": "Password1!", "accepted_terms": True})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        assert data["user"]["role"] == "user"
        assert data["user"]["verified"] is False


# ============================================================
# LOGIN: lockout after 5 wrong attempts then unlock with mongo reset, then success
# ============================================================
class TestLoginLockout:
    def test_lockout_after_5_wrong_then_success(self):
        # Create a fresh user so we don't break alice/bob
        uname = f"lk_{uuid.uuid4().hex[:6]}"
        email = f"{uname}@t.com"
        pw = "Password1!"
        r = requests.post(f"{BASE_URL}/api/auth/signup",
                          json={"email": email, "username": uname, "password": pw, "accepted_terms": True})
        assert r.status_code == 200, r.text

        # 5 wrong attempts
        last = None
        for _ in range(5):
            last = requests.post(f"{BASE_URL}/api/auth/login",
                                 json={"email": email, "password": "Wrong@9999", "accepted_terms": True})
        assert last.status_code == 400  # final wrong attempt returns 400, but lockout triggered
        # Next attempt with correct password should be 429 (locked)
        r2 = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
        assert r2.status_code == 429, r2.text
        assert "locked" in r2.json()["detail"].lower() or "try again" in r2.json()["detail"].lower()

        # Unlock via mongo and verify success
        async def _unlock():
            cli = AsyncIOMotorClient(MONGO_URL)
            db = cli[DB_NAME]
            await db.users.update_one({"email": email}, {"$set": {"locked_until": None, "failed_attempts": 0}})
            cli.close()
        asyncio.run(_unlock())
        r3 = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
        assert r3.status_code == 200, r3.text


# ============================================================
# BLOCK / UNBLOCK / REPORT (with auto-block)
# ============================================================
class TestBlockReport:
    def test_block_hides_chat_and_prevents_messaging(self, alice, bob):
        # alice blocks bob
        r = requests.post(f"{BASE_URL}/api/safety/block",
                          headers=_hdr(alice["token"]),
                          json={"target_user_id": bob["user"]["id"]})
        assert r.status_code == 200
        assert r.json()["blocked"] is True

        # alice's chats should NOT show bob
        chats = requests.get(f"{BASE_URL}/api/chats", headers=_hdr(alice["token"])).json()
        assert all(c["friend"]["username"] != "bob_test" for c in chats), chats

        # bob trying to message alice -> 403
        r2 = requests.post(f"{BASE_URL}/api/messages", headers=_hdr(bob["token"]),
                           json={"to_user_id": alice["user"]["id"], "type": "text", "text": "hi"})
        assert r2.status_code == 403

        # blocked list contains bob
        blist = requests.get(f"{BASE_URL}/api/safety/blocked", headers=_hdr(alice["token"])).json()
        assert any(u["username"] == "bob_test" for u in blist)

    def test_unblock_restores_chat(self, alice, bob):
        r = requests.post(f"{BASE_URL}/api/safety/unblock",
                          headers=_hdr(alice["token"]),
                          json={"target_user_id": bob["user"]["id"]})
        assert r.status_code == 200
        # bob should be able to message alice again
        r2 = requests.post(f"{BASE_URL}/api/messages", headers=_hdr(bob["token"]),
                          json={"to_user_id": alice["user"]["id"], "type": "text", "text": "back"})
        assert r2.status_code == 200, r2.text

    def test_report_auto_blocks(self, alice, bob):
        r = requests.post(f"{BASE_URL}/api/safety/report",
                          headers=_hdr(alice["token"]),
                          json={"target_user_id": bob["user"]["id"], "reason": "spam test"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["reported"] is True and data["auto_blocked"] is True
        # bob now cannot message alice
        r2 = requests.post(f"{BASE_URL}/api/messages", headers=_hdr(bob["token"]),
                           json={"to_user_id": alice["user"]["id"], "type": "text", "text": "after-report"})
        assert r2.status_code == 403


# ============================================================
# DELETE FOR EVERYONE (happy path)
# ============================================================
class TestDeleteForEveryone:
    def test_delete_message_for_everyone(self, alice, bob):
        # first unblock to allow normal flow
        requests.post(f"{BASE_URL}/api/safety/unblock", headers=_hdr(alice["token"]),
                      json={"target_user_id": bob["user"]["id"]})

        # alice sends a fresh text
        text = f"to-delete-{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/messages", headers=_hdr(alice["token"]),
                          json={"to_user_id": bob["user"]["id"], "type": "text", "text": text})
        assert r.status_code == 200, r.text
        msg_id = r.json()["id"]

        # alice deletes for everyone
        r2 = requests.post(f"{BASE_URL}/api/messages/delete-for-everyone",
                           headers=_hdr(alice["token"]),
                           json={"message_id": msg_id})
        assert r2.status_code == 200, r2.text
        assert r2.json()["deleted"] is True

        # bob's GET messages -> the message has deleted_for_everyone=True and text=None
        msgs = requests.get(f"{BASE_URL}/api/messages/{alice['user']['id']}",
                            headers=_hdr(bob["token"])).json()
        m = next((x for x in msgs if x["id"] == msg_id), None)
        assert m is not None
        assert m["deleted_for_everyone"] is True
        assert m["text"] is None
        assert m["image_base64"] is None


# ============================================================
# VIEW-ONCE image
# ============================================================
class TestViewOnce:
    def test_view_once_image_disappears_after_view(self, alice, bob):
        # alice sends view-once image to bob
        r = requests.post(f"{BASE_URL}/api/messages", headers=_hdr(alice["token"]),
                          json={"to_user_id": bob["user"]["id"], "type": "image",
                                "image_base64": f"data:image/png;base64,{TINY_PNG_B64}",
                                "view_once": True})
        assert r.status_code == 200, r.text
        msg_id = r.json()["id"]

        # bob fetches messages - image_base64 should be populated
        msgs = requests.get(f"{BASE_URL}/api/messages/{alice['user']['id']}",
                            headers=_hdr(bob["token"])).json()
        m = next((x for x in msgs if x["id"] == msg_id), None)
        assert m and m["view_once"] is True
        assert m["image_base64"] is not None

        # bob marks it viewed
        r2 = requests.post(f"{BASE_URL}/api/messages/image-viewed",
                           headers=_hdr(bob["token"]),
                           json={"message_id": msg_id})
        assert r2.status_code == 200, r2.text

        # subsequent GET messages: image_base64 should be None for bob
        msgs2 = requests.get(f"{BASE_URL}/api/messages/{alice['user']['id']}",
                             headers=_hdr(bob["token"])).json()
        m2 = next((x for x in msgs2 if x["id"] == msg_id), None)
        assert m2 and m2["image_base64"] is None


# ============================================================
# SCREENSHOT event endpoint
# ============================================================
class TestScreenshotEvent:
    def test_screenshot_event_logged(self, alice, bob):
        r = requests.post(f"{BASE_URL}/api/safety/screenshot",
                          headers=_hdr(alice["token"]),
                          json={"chat_with": bob["user"]["id"], "context": "chat"})
        assert r.status_code == 200, r.text
        assert r.json()["logged"] is True


# ============================================================
# Account DELETE (fresh user)
# ============================================================
class TestDeleteAccount:
    def test_delete_account_removes_login(self):
        uname = f"del_{uuid.uuid4().hex[:6]}"
        email = f"{uname}@t.com"
        pw = "Password1!"
        s = requests.post(f"{BASE_URL}/api/auth/signup",
                          json={"email": email, "username": uname, "password": pw, "accepted_terms": True})
        assert s.status_code == 200
        tok = s.json()["token"]
        r = requests.delete(f"{BASE_URL}/api/auth/account", headers=_hdr(tok))
        assert r.status_code == 200
        # subsequent login fails
        r2 = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
        assert r2.status_code == 400
        assert "incorrect" in r2.json()["detail"].lower()


# ============================================================
# ADMIN CRM
# ============================================================
class TestAdminAuth:
    def test_admin_me_rejects_end_user(self, alice):
        r = requests.get(f"{BASE_URL}/api/admin/me", headers=_hdr(alice["token"]))
        assert r.status_code == 403

    def test_admin_me_admin(self, admin):
        r = requests.get(f"{BASE_URL}/api/admin/me", headers=_hdr(admin["token"]))
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_admin_stats(self, admin):
        r = requests.get(f"{BASE_URL}/api/admin/stats", headers=_hdr(admin["token"]))
        assert r.status_code == 200
        d = r.json()
        for k in ("total_users", "verified_users", "signups_24h", "logins_24h", "open_reports"):
            assert k in d
            assert isinstance(d[k], int)


class TestAdminUsersPII:
    def test_users_masked_by_default(self, admin):
        r = requests.get(f"{BASE_URL}/api/admin/users?q=alice", headers=_hdr(admin["token"]))
        assert r.status_code == 200
        users = r.json()
        alice_row = next((u for u in users if u["username"] == "alice_test"), None)
        assert alice_row is not None
        assert "*" in alice_row["email"]

    def test_users_reveal_admin(self, admin):
        r = requests.get(f"{BASE_URL}/api/admin/users?q=alice&reveal=true&reason=qa-check",
                         headers=_hdr(admin["token"]))
        assert r.status_code == 200
        users = r.json()
        alice_row = next((u for u in users if u["username"] == "alice_test"), None)
        assert alice_row is not None
        assert alice_row["email"] == "alice@test.com"

    def test_users_reveal_supervisor_downgraded(self, supervisor):
        r = requests.get(f"{BASE_URL}/api/admin/users?q=alice&reveal=true&reason=qa-check",
                         headers=_hdr(supervisor["token"]))
        assert r.status_code == 200
        users = r.json()
        alice_row = next((u for u in users if u["username"] == "alice_test"), None)
        assert alice_row is not None
        assert "*" in alice_row["email"], "Supervisor must always see masked email"


class TestAdminReports:
    def test_reports_resolve_block_suspends_user(self, alice, bob, admin):
        # ensure a fresh open report exists (alice -> bob)
        requests.post(f"{BASE_URL}/api/safety/report", headers=_hdr(alice["token"]),
                      json={"target_user_id": bob["user"]["id"], "reason": "admin flow test"})

        # admin lists open reports
        r = requests.get(f"{BASE_URL}/api/admin/reports?status_filter=open",
                         headers=_hdr(admin["token"]))
        assert r.status_code == 200
        reports = r.json()
        rep = next((x for x in reports if x["target_username"] == "bob_test"), None)
        assert rep is not None, "No open report against bob found"

        # admin resolves with block_user
        r2 = requests.post(f"{BASE_URL}/api/admin/reports/{rep['id']}/resolve",
                           headers=_hdr(admin["token"]),
                           json={"action": "block_user", "notes": "test suspend"})
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "actioned_block"

        # bob login -> 403 suspended
        time.sleep(0.3)
        r3 = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": "bob@test.com", "password": "Test@1234", "accepted_terms": True})
        assert r3.status_code == 403, r3.text
        assert "suspended" in r3.json()["detail"].lower()

        # admin unsuspends
        r4 = requests.post(f"{BASE_URL}/api/admin/users/{bob['user']['id']}/unsuspend",
                           headers=_hdr(admin["token"]),
                           json={})
        assert r4.status_code == 200

        # bob login works again
        r5 = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": "bob@test.com", "password": "Test@1234", "accepted_terms": True})
        assert r5.status_code == 200


class TestAdminRolesAudit:
    def test_role_change_and_audit_log(self, admin, supervisor):
        # admin promotes supervisor to manager
        r = requests.post(f"{BASE_URL}/api/admin/roles",
                          headers=_hdr(admin["token"]),
                          json={"user_id": supervisor["user"]["id"], "role": "manager"})
        assert r.status_code == 200, r.text

        # supervisor (old token, role is now manager) cannot access audit-log: only admin can
        # we need a fresh token for the upgraded role; old token's role check is at endpoint
        # since require_admin checks user.role from db, old token still works but role is manager
        r2 = requests.get(f"{BASE_URL}/api/admin/audit-log", headers=_hdr(supervisor["token"]))
        assert r2.status_code == 403  # manager cannot access audit-log

        # admin CAN access audit-log
        r3 = requests.get(f"{BASE_URL}/api/admin/audit-log", headers=_hdr(admin["token"]))
        assert r3.status_code == 200
        log = r3.json()
        assert isinstance(log, list) and len(log) > 0
        # should contain set_role action by admin
        assert any(x.get("action") == "set_role" and x.get("actor_username") == "admin" for x in log), log[:3]

        # restore supervisor role back
        r4 = requests.post(f"{BASE_URL}/api/admin/roles",
                           headers=_hdr(admin["token"]),
                           json={"user_id": supervisor["user"]["id"], "role": "supervisor"})
        assert r4.status_code == 200
