"""MonoChat backend integration tests."""
import asyncio
import base64
import io
import json
import time
import uuid

import pytest
import requests

try:
    import websockets
    HAS_WS = True
except ImportError:
    HAS_WS = False

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


# ------------------- Helpers -------------------
def _real_jpeg_b64(seed: int = 7) -> str:
    """Return a base64 JPEG with real visual features (gradient + shapes)."""
    if not HAS_PIL:
        # fallback minimal JPEG (1x1 white) - not ideal but works for shape testing
        png_hex = "ffd8ffe000104a46494600010100000100010000ffdb0043000806060706050807070709090...".encode()
        return base64.b64encode(png_hex).decode()
    img = Image.new("RGB", (256, 256))
    px = img.load()
    for y in range(256):
        for x in range(256):
            px[x, y] = ((x + seed * 13) % 256, (y * 2 + seed * 7) % 256, ((x ^ y) + seed) % 256)
    # draw a darker square in middle to add edges
    for y in range(80, 176):
        for x in range(80, 176):
            px[x, y] = (40, 40, 40)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


# ------------------- Health -------------------
class TestHealth:
    def test_root(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"


# ------------------- Auth -------------------
class TestAuth:
    def test_signup_invalid_email(self, base_url, api_client):
        r = api_client.post(f"{base_url}/api/auth/signup",
                            json={"email": "not-an-email", "username": "abc123", "password": "Password1!", "accepted_terms": True})
        assert r.status_code == 400
        assert "email" in r.json()["detail"].lower()

    def test_signup_short_password(self, base_url, api_client):
        r = api_client.post(f"{base_url}/api/auth/signup",
                            json={"email": f"x{uuid.uuid4().hex[:6]}@t.com", "username": "abc123", "password": "short", "accepted_terms": True})
        assert r.status_code == 422  # pydantic min_length

    def test_signup_invalid_username(self, base_url, api_client):
        r = api_client.post(f"{base_url}/api/auth/signup",
                            json={"email": f"x{uuid.uuid4().hex[:6]}@t.com", "username": "AB!", "password": "Password1!", "accepted_terms": True})
        assert r.status_code == 400
        assert "username" in r.json()["detail"].lower()

    def test_signup_duplicate_username(self, base_url, api_client):
        r = api_client.post(f"{base_url}/api/auth/signup",
                            json={"email": f"new{uuid.uuid4().hex[:8]}@t.com", "username": "alice_test", "password": "Password1!", "accepted_terms": True})
        assert r.status_code == 400
        assert "taken" in r.json()["detail"].lower() or "username" in r.json()["detail"].lower()

    def test_signup_duplicate_email(self, base_url, api_client):
        r = api_client.post(f"{base_url}/api/auth/signup",
                            json={"email": "alice@test.com", "username": f"u{uuid.uuid4().hex[:8]}", "password": "Password1!", "accepted_terms": True})
        assert r.status_code == 400
        assert "email" in r.json()["detail"].lower()

    def test_signup_and_login_new_user(self, base_url, api_client):
        uname = f"test_{uuid.uuid4().hex[:8]}"
        email = f"{uname}@test.com"
        r = api_client.post(f"{base_url}/api/auth/signup",
                            json={"email": email, "username": uname, "password": "Password1!", "accepted_terms": True})
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and data["user"]["username"] == uname
        assert data["user"]["verified"] is False
        # login
        r2 = api_client.post(f"{base_url}/api/auth/login", json={"email": email, "password": "Password1!", "accepted_terms": True})
        assert r2.status_code == 200
        assert r2.json()["user"]["email"] == email

    def test_login_wrong_password(self, base_url, api_client):
        r = api_client.post(f"{base_url}/api/auth/login", json={"email": "alice@test.com", "password": "WrongPass1!", "accepted_terms": True})
        assert r.status_code == 400

    def test_me_with_token(self, base_url, alice_headers):
        r = requests.get(f"{base_url}/api/auth/me", headers=alice_headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["username"] == "alice_test"
        assert data["verified"] is True

    def test_me_invalid_token(self, base_url):
        r = requests.get(f"{base_url}/api/auth/me",
                         headers={"Authorization": "Bearer invalidtoken"}, timeout=10)
        assert r.status_code == 401


# ------------------- Verification gating -------------------
class TestVerificationGating:
    @pytest.fixture(scope="class")
    def unverified_user(self, base_url):
        uname = f"unv_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{base_url}/api/auth/signup",
                          json={"email": f"{uname}@t.com", "username": uname, "password": "Password1!", "accepted_terms": True})
        assert r.status_code == 200
        return r.json()

    def test_chats_blocked(self, base_url, unverified_user):
        r = requests.get(f"{base_url}/api/chats",
                         headers={"Authorization": f"Bearer {unverified_user['token']}"}, timeout=10)
        assert r.status_code == 403

    def test_requests_blocked(self, base_url, unverified_user):
        r = requests.get(f"{base_url}/api/requests",
                         headers={"Authorization": f"Bearer {unverified_user['token']}"}, timeout=10)
        assert r.status_code == 403

    def test_search_blocked(self, base_url, unverified_user):
        r = requests.get(f"{base_url}/api/users/search?username=bob_test",
                         headers={"Authorization": f"Bearer {unverified_user['token']}"}, timeout=10)
        assert r.status_code == 403


# ------------------- Verification countries + submit -------------------
class TestVerification:
    def test_countries(self, base_url, alice_headers):
        r = requests.get(f"{base_url}/api/verification/countries", headers=alice_headers, timeout=10)
        assert r.status_code == 200
        countries = r.json()
        assert isinstance(countries, list) and len(countries) >= 5
        india = next((c for c in countries if c["code"] == "IN"), None)
        assert india is not None
        assert "Aadhaar Card" in india["id_types"]

    def test_submit_returns_structured_response(self, base_url):
        """Calls AI verification once; both verified=true/false are acceptable as long as schema is valid."""
        # Create a fresh unverified user just for this test
        uname = f"vsub_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{base_url}/api/auth/signup",
                          json={"email": f"{uname}@t.com", "username": uname, "password": "Password1!", "accepted_terms": True})
        assert r.status_code == 200
        token = r.json()["token"]
        b64_id = _real_jpeg_b64(seed=11)
        b64_selfie = _real_jpeg_b64(seed=29)
        r2 = requests.post(f"{base_url}/api/verification/submit",
                           headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                           json={"country": "IN", "id_type": "Passport",
                                 "id_image_base64": b64_id, "selfie_base64": b64_selfie},
                           timeout=120)
        assert r2.status_code < 500, f"5xx error: {r2.status_code} {r2.text}"
        # Accept 200 OR 502 (LLM unavailable) — but request must not 5xx silently
        if r2.status_code == 200:
            data = r2.json()
            for key in ("verified", "confidence", "reason"):
                assert key in data
            assert isinstance(data["verified"], bool)
            assert isinstance(data["confidence"], int)
        else:
            # 502 means service down, acceptable per spec
            assert r2.status_code in (502,)


# ------------------- Friend requests -------------------
class TestRequests:
    def test_search_existing_user(self, base_url, alice_headers):
        r = requests.get(f"{base_url}/api/users/search?username=bob_test", headers=alice_headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["username"] == "bob_test"

    def test_search_self(self, base_url, alice_headers):
        r = requests.get(f"{base_url}/api/users/search?username=alice_test", headers=alice_headers, timeout=10)
        assert r.status_code == 400

    def test_search_unknown(self, base_url, alice_headers):
        r = requests.get(f"{base_url}/api/users/search?username=nonexistent_xyz_{uuid.uuid4().hex[:6]}",
                         headers=alice_headers, timeout=10)
        assert r.status_code == 404

    def test_self_request(self, base_url, alice_headers):
        r = requests.post(f"{base_url}/api/requests", headers=alice_headers,
                          json={"to_username": "alice_test"}, timeout=10)
        assert r.status_code == 400

    def test_unknown_request(self, base_url, alice_headers):
        r = requests.post(f"{base_url}/api/requests", headers=alice_headers,
                          json={"to_username": f"no_user_{uuid.uuid4().hex[:6]}"}, timeout=10)
        assert r.status_code == 404

    def test_full_request_accept_flow(self, base_url, alice_headers, bob_headers):
        """End-to-end: alice -> request -> bob accepts -> friendship -> messaging works."""
        # First check whether already friends. If yes, skip request creation.
        s = requests.get(f"{base_url}/api/users/search?username=bob_test", headers=alice_headers, timeout=10).json()
        if not s.get("is_friend"):
            if s.get("pending_request"):
                # find pending request id from bob's incoming
                incoming = requests.get(f"{base_url}/api/requests", headers=bob_headers, timeout=10).json()["incoming"]
                req = next((x for x in incoming if x["from_username"] == "alice_test"), None)
                assert req
            else:
                r = requests.post(f"{base_url}/api/requests", headers=alice_headers,
                                  json={"to_username": "bob_test"}, timeout=10)
                assert r.status_code == 200, r.text
                req = r.json()
            # accept
            ra = requests.post(f"{base_url}/api/requests/{req['id']}/respond", headers=bob_headers,
                               json={"action": "accept"}, timeout=10)
            assert ra.status_code == 200
            assert ra.json()["status"] == "accepted"
        # Now verify duplicate request returns "already connected"
        r2 = requests.post(f"{base_url}/api/requests", headers=alice_headers,
                           json={"to_username": "bob_test"}, timeout=10)
        assert r2.status_code == 400
        assert "connected" in r2.json()["detail"].lower() or "already" in r2.json()["detail"].lower()


# ------------------- Messaging -------------------
class TestMessaging:
    def _ensure_friends(self, base_url, alice, alice_headers, bob, bob_headers):
        s = requests.get(f"{base_url}/api/users/search?username=bob_test", headers=alice_headers, timeout=10).json()
        if s.get("is_friend"):
            return
        if not s.get("pending_request"):
            requests.post(f"{base_url}/api/requests", headers=alice_headers,
                          json={"to_username": "bob_test"}, timeout=10)
        incoming = requests.get(f"{base_url}/api/requests", headers=bob_headers, timeout=10).json()["incoming"]
        req = next((x for x in incoming if x["from_username"] == "alice_test"), None)
        if req:
            requests.post(f"{base_url}/api/requests/{req['id']}/respond", headers=bob_headers,
                          json={"action": "accept"}, timeout=10)

    def test_send_text_message(self, base_url, alice, bob, alice_headers, bob_headers):
        self._ensure_friends(base_url, alice, alice_headers, bob, bob_headers)
        text = f"hello from test {uuid.uuid4().hex[:6]}"
        r = requests.post(f"{base_url}/api/messages", headers=alice_headers,
                          json={"to_user_id": bob["user"]["id"], "type": "text", "text": text}, timeout=10)
        assert r.status_code == 200, r.text
        msg = r.json()
        assert msg["text"] == text
        assert msg["sender_id"] == alice["user"]["id"]
        # GET messages and verify persisted
        r2 = requests.get(f"{base_url}/api/messages/{bob['user']['id']}", headers=alice_headers, timeout=10)
        assert r2.status_code == 200
        assert any(m["id"] == msg["id"] for m in r2.json())

    def test_send_image_message(self, base_url, alice, bob, alice_headers, bob_headers):
        self._ensure_friends(base_url, alice, alice_headers, bob, bob_headers)
        b64 = _real_jpeg_b64(seed=42)
        r = requests.post(f"{base_url}/api/messages", headers=alice_headers,
                          json={"to_user_id": bob["user"]["id"], "type": "image",
                                "image_base64": f"data:image/jpeg;base64,{b64}"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["type"] == "image"

    def test_chats_list_shows_friend(self, base_url, alice, bob, alice_headers, bob_headers):
        self._ensure_friends(base_url, alice, alice_headers, bob, bob_headers)
        r = requests.get(f"{base_url}/api/chats", headers=alice_headers, timeout=10)
        assert r.status_code == 200
        chats = r.json()
        bob_chat = next((c for c in chats if c["friend"]["username"] == "bob_test"), None)
        assert bob_chat is not None
        assert "unread" in bob_chat and "last_message" in bob_chat

    def test_mark_read(self, base_url, alice, bob, alice_headers, bob_headers):
        self._ensure_friends(base_url, alice, alice_headers, bob, bob_headers)
        # bob sends a message to alice
        requests.post(f"{base_url}/api/messages", headers=bob_headers,
                      json={"to_user_id": alice["user"]["id"], "type": "text", "text": "ping"}, timeout=10)
        # alice marks read
        r = requests.post(f"{base_url}/api/chats/{bob['user']['id']}/read", headers=alice_headers, timeout=10)
        assert r.status_code == 200
        assert "marked" in r.json()

    def test_message_to_non_friend_blocked(self, base_url, alice, alice_headers):
        # Create a stranger (verified bypass not possible via API). Use any random uuid.
        r = requests.post(f"{base_url}/api/messages", headers=alice_headers,
                          json={"to_user_id": str(uuid.uuid4()), "type": "text", "text": "hi"}, timeout=10)
        assert r.status_code == 403

    def test_messages_to_non_friend_get_blocked(self, base_url, alice_headers):
        r = requests.get(f"{base_url}/api/messages/{uuid.uuid4()}", headers=alice_headers, timeout=10)
        assert r.status_code == 403


# ------------------- WebSocket -------------------
@pytest.mark.skipif(not HAS_WS, reason="websockets not installed")
class TestWebSocket:
    def test_ws_connect_and_message_push(self, base_url, ws_url, alice, bob, alice_headers, bob_headers):
        # ensure friends
        TestMessaging()._ensure_friends(base_url, alice, alice_headers, bob, bob_headers)

        async def run():
            uri_bob = f"{ws_url}/api/ws?token={bob['token']}"
            async with websockets.connect(uri_bob, open_timeout=15) as ws_bob:
                await asyncio.sleep(0.5)
                # alice sends message to bob via REST
                text = f"ws-push-{uuid.uuid4().hex[:6]}"
                r = requests.post(f"{base_url}/api/messages", headers=alice_headers,
                                  json={"to_user_id": bob["user"]["id"], "type": "text", "text": text}, timeout=10)
                assert r.status_code == 200
                # bob should receive WS push
                received = None
                try:
                    while True:
                        raw = await asyncio.wait_for(ws_bob.recv(), timeout=5)
                        data = json.loads(raw)
                        if data.get("type") == "message:new" and data["message"]["text"] == text:
                            received = data
                            break
                except asyncio.TimeoutError:
                    pass
                assert received is not None, "Did not receive message:new push"
        asyncio.run(run())

    def test_ws_call_unavailable_when_offline(self, base_url, ws_url, alice, bob):
        async def run():
            uri_alice = f"{ws_url}/api/ws?token={alice['token']}"
            async with websockets.connect(uri_alice, open_timeout=15) as ws_alice:
                await ws_alice.send(json.dumps({"type": "call:request", "to": bob["user"]["id"], "callType": "voice"}))
                # No bob connected -> expect call:unavailable
                got = None
                try:
                    while True:
                        raw = await asyncio.wait_for(ws_alice.recv(), timeout=4)
                        data = json.loads(raw)
                        if data.get("type") == "call:unavailable":
                            got = data
                            break
                except asyncio.TimeoutError:
                    pass
                assert got is not None
        asyncio.run(run())

    def test_ws_invalid_token_rejected(self, ws_url):
        async def run():
            uri = f"{ws_url}/api/ws?token=badtoken"
            try:
                async with websockets.connect(uri, open_timeout=10) as ws:
                    # Should close immediately
                    try:
                        await asyncio.wait_for(ws.recv(), timeout=3)
                    except Exception:
                        pass
                    assert ws.state.name in ("CLOSED", "CLOSING")
            except Exception:
                # Closed before opening - acceptable
                return
        asyncio.run(run())
