"""Iteration 4 feature tests:
   - Profile image upload/get/delete
   - Voice / video / location / document messages
   - Reply previews
   - Reaction toggle (with WS push)
   - Typing indicator (with WS push)
   - Read receipts (with WS push)
"""
import asyncio
import base64
import io
import json
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


def _png_b64(size: int = 16) -> str:
    if not HAS_PIL:
        # 1x1 png
        return base64.b64encode(bytes.fromhex(
            "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
            "890000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
        )).decode()
    img = Image.new("RGB", (size, size), (100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _ensure_friends(base_url, alice_headers, bob_headers):
    s = requests.get(f"{base_url}/api/users/search?username=bob_test",
                     headers=alice_headers, timeout=10).json()
    if s.get("is_friend"):
        return
    if not s.get("pending_request"):
        requests.post(f"{base_url}/api/requests", headers=alice_headers,
                      json={"to_username": "bob_test"}, timeout=10)
    incoming = requests.get(f"{base_url}/api/requests", headers=bob_headers, timeout=10).json()["incoming"]
    req = next((x for x in incoming if x["from_username"] == "alice_test"), None)
    if req:
        requests.post(f"{base_url}/api/requests/{req['id']}/respond",
                      headers=bob_headers, json={"action": "accept"}, timeout=10)


# ----------------- Profile image -----------------
class TestProfileImage:
    def test_upload_and_get_via_me(self, base_url, alice_headers):
        b64 = _png_b64()
        r = requests.post(f"{base_url}/api/profile/image", headers=alice_headers,
                          json={"image_base64": f"data:image/png;base64,{b64}"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["updated"] is True

        me = requests.get(f"{base_url}/api/auth/me", headers=alice_headers, timeout=10).json()
        assert me.get("profile_image_base64"), "profile_image_base64 not returned from /auth/me"
        assert b64 in me["profile_image_base64"]

    def test_get_friend_profile_image(self, base_url, alice_headers, bob_headers):
        _ensure_friends(base_url, alice_headers, bob_headers)
        # ensure bob has an image
        b64 = _png_b64(24)
        rb = requests.post(f"{base_url}/api/profile/image", headers=bob_headers,
                           json={"image_base64": f"data:image/png;base64,{b64}"}, timeout=15)
        assert rb.status_code == 200
        # alice fetches bob
        bob_id = requests.get(f"{base_url}/api/auth/me", headers=bob_headers, timeout=10).json()["id"]
        r = requests.get(f"{base_url}/api/profile/image/{bob_id}", headers=alice_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["username"] == "bob_test"
        assert data["profile_image_base64"] and b64 in data["profile_image_base64"]

    def test_delete_profile_image(self, base_url, alice_headers):
        # upload first
        requests.post(f"{base_url}/api/profile/image", headers=alice_headers,
                      json={"image_base64": f"data:image/png;base64,{_png_b64()}"}, timeout=15)
        r = requests.delete(f"{base_url}/api/profile/image", headers=alice_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["removed"] is True
        me = requests.get(f"{base_url}/api/auth/me", headers=alice_headers, timeout=10).json()
        assert not me.get("profile_image_base64")

    def test_oversize_rejected(self, base_url, alice_headers):
        # > 2.5MB string
        huge = "A" * (2_600_000)
        r = requests.post(f"{base_url}/api/profile/image", headers=alice_headers,
                          json={"image_base64": huge}, timeout=30)
        assert r.status_code == 400


# ----------------- Voice / video / location / document -----------------
class TestRichMediaMessages:
    def test_send_audio_message(self, base_url, alice, bob, alice_headers, bob_headers):
        _ensure_friends(base_url, alice_headers, bob_headers)
        r = requests.post(f"{base_url}/api/messages", headers=alice_headers,
                          json={
                              "to_user_id": bob["user"]["id"],
                              "type": "audio",
                              "audio_base64": "data:audio/m4a;base64,AAAA",
                              "duration_ms": 4200,
                              "waveform": [1, 5, 9, 12, 7, 3, 1],
                          }, timeout=15)
        assert r.status_code == 200, r.text
        msg = r.json()
        assert msg["type"] == "audio"
        assert msg["duration_ms"] == 4200
        assert msg["waveform"] == [1, 5, 9, 12, 7, 3, 1]
        assert msg["audio_base64"]

    def test_send_video_message(self, base_url, alice, bob, alice_headers, bob_headers):
        _ensure_friends(base_url, alice_headers, bob_headers)
        r = requests.post(f"{base_url}/api/messages", headers=alice_headers,
                          json={
                              "to_user_id": bob["user"]["id"],
                              "type": "video",
                              "video_base64": "data:video/mp4;base64,AAAA",
                              "duration_ms": 3000,
                          }, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["type"] == "video"
        assert r.json()["duration_ms"] == 3000

    def test_send_location(self, base_url, alice, bob, alice_headers, bob_headers):
        _ensure_friends(base_url, alice_headers, bob_headers)
        r = requests.post(f"{base_url}/api/messages", headers=alice_headers,
                          json={
                              "to_user_id": bob["user"]["id"],
                              "type": "location",
                              "latitude": 12.9716,
                              "longitude": 77.5946,
                              "location_label": "Bengaluru HQ",
                          }, timeout=10)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["latitude"] == 12.9716 and m["longitude"] == 77.5946
        assert m["location_label"] == "Bengaluru HQ"

    def test_send_document(self, base_url, alice, bob, alice_headers, bob_headers):
        _ensure_friends(base_url, alice_headers, bob_headers)
        r = requests.post(f"{base_url}/api/messages", headers=alice_headers,
                          json={
                              "to_user_id": bob["user"]["id"],
                              "type": "document",
                              "document_base64": "data:application/pdf;base64,AAAA",
                              "document_name": "spec.pdf",
                              "document_mime": "application/pdf",
                              "document_size": 12345,
                          }, timeout=10)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["document_name"] == "spec.pdf"
        assert m["document_size"] == 12345

    # ----- validation -----
    def test_audio_missing_payload_400(self, base_url, alice, bob, alice_headers, bob_headers):
        _ensure_friends(base_url, alice_headers, bob_headers)
        r = requests.post(f"{base_url}/api/messages", headers=alice_headers,
                          json={"to_user_id": bob["user"]["id"], "type": "audio"}, timeout=10)
        assert r.status_code == 400

    def test_location_missing_coords_400(self, base_url, alice, bob, alice_headers, bob_headers):
        _ensure_friends(base_url, alice_headers, bob_headers)
        r = requests.post(f"{base_url}/api/messages", headers=alice_headers,
                          json={"to_user_id": bob["user"]["id"], "type": "location"}, timeout=10)
        assert r.status_code == 400

    def test_document_missing_name_400(self, base_url, alice, bob, alice_headers, bob_headers):
        _ensure_friends(base_url, alice_headers, bob_headers)
        r = requests.post(f"{base_url}/api/messages", headers=alice_headers,
                          json={"to_user_id": bob["user"]["id"], "type": "document",
                                "document_base64": "data:application/pdf;base64,AAAA"}, timeout=10)
        assert r.status_code == 400


# ----------------- Reply preview -----------------
class TestReplyPreview:
    def test_reply_populates_preview(self, base_url, alice, bob, alice_headers, bob_headers):
        _ensure_friends(base_url, alice_headers, bob_headers)
        orig = requests.post(f"{base_url}/api/messages", headers=alice_headers,
                             json={"to_user_id": bob["user"]["id"], "type": "text",
                                   "text": "original message body"}, timeout=10).json()
        r = requests.post(f"{base_url}/api/messages", headers=bob_headers,
                         json={"to_user_id": alice["user"]["id"], "type": "text",
                               "text": "replying!", "reply_to_id": orig["id"]}, timeout=10)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["reply_preview"] is not None
        assert m["reply_preview"]["id"] == orig["id"]
        assert m["reply_preview"]["sender_id"] == alice["user"]["id"]
        assert m["reply_preview"]["type"] == "text"
        assert "original message body" in m["reply_preview"]["text"]


# ----------------- Reactions (with WS) -----------------
@pytest.mark.skipif(not HAS_WS, reason="websockets not installed")
class TestReactions:
    def test_react_add_and_remove_pushes_ws(self, base_url, ws_url, alice, bob, alice_headers, bob_headers):
        _ensure_friends(base_url, alice_headers, bob_headers)
        msg = requests.post(f"{base_url}/api/messages", headers=alice_headers,
                            json={"to_user_id": bob["user"]["id"], "type": "text",
                                  "text": f"reactme-{uuid.uuid4().hex[:6]}"}, timeout=10).json()

        async def run():
            uri_bob = f"{ws_url}/api/ws?token={bob['token']}"
            async with websockets.connect(uri_bob, open_timeout=15) as ws_bob:
                await asyncio.sleep(0.4)
                # alice adds reaction
                ra = requests.post(f"{base_url}/api/messages/react", headers=alice_headers,
                                   json={"message_id": msg["id"], "emoji": "❤️"}, timeout=10)
                assert ra.status_code == 200, ra.text
                payload = ra.json()
                assert payload["action"] == "added"
                assert payload["reactions"][alice["user"]["id"]] == "❤️"

                got_added = None
                try:
                    while True:
                        raw = await asyncio.wait_for(ws_bob.recv(), timeout=5)
                        data = json.loads(raw)
                        if data.get("type") == "message:reaction" and data["message_id"] == msg["id"]:
                            got_added = data
                            break
                except asyncio.TimeoutError:
                    pass
                assert got_added and got_added["action"] == "added" and got_added["emoji"] == "❤️"

                # Toggle: alice sends the same emoji → should be removed
                rb = requests.post(f"{base_url}/api/messages/react", headers=alice_headers,
                                   json={"message_id": msg["id"], "emoji": "❤️"}, timeout=10)
                assert rb.status_code == 200
                assert rb.json()["action"] == "removed"
                assert alice["user"]["id"] not in rb.json()["reactions"]

                got_removed = None
                try:
                    while True:
                        raw = await asyncio.wait_for(ws_bob.recv(), timeout=5)
                        data = json.loads(raw)
                        if data.get("type") == "message:reaction" and data.get("action") == "removed":
                            got_removed = data
                            break
                except asyncio.TimeoutError:
                    pass
                assert got_removed is not None

        asyncio.run(run())


# ----------------- Typing indicator -----------------
@pytest.mark.skipif(not HAS_WS, reason="websockets not installed")
class TestTypingIndicator:
    def test_typing_pushes_ws_to_friend(self, base_url, ws_url, alice, bob, alice_headers, bob_headers):
        _ensure_friends(base_url, alice_headers, bob_headers)

        async def run():
            uri_bob = f"{ws_url}/api/ws?token={bob['token']}"
            async with websockets.connect(uri_bob, open_timeout=15) as ws_bob:
                await asyncio.sleep(0.4)
                r = requests.post(f"{base_url}/api/typing", headers=alice_headers,
                                  json={"to_user_id": bob["user"]["id"], "typing": True}, timeout=10)
                assert r.status_code == 200 and r.json()["sent"] is True

                got = None
                try:
                    while True:
                        raw = await asyncio.wait_for(ws_bob.recv(), timeout=5)
                        data = json.loads(raw)
                        if data.get("type") == "typing":
                            got = data
                            break
                except asyncio.TimeoutError:
                    pass
                assert got and got["from"] == alice["user"]["id"] and got["typing"] is True
        asyncio.run(run())

    def test_typing_to_non_friend_returns_sent_false(self, base_url, alice_headers):
        r = requests.post(f"{base_url}/api/typing", headers=alice_headers,
                          json={"to_user_id": str(uuid.uuid4()), "typing": True}, timeout=10)
        assert r.status_code == 200
        assert r.json()["sent"] is False


# ----------------- Read receipts (WS) -----------------
@pytest.mark.skipif(not HAS_WS, reason="websockets not installed")
class TestReadReceipts:
    def test_mark_read_pushes_ws_to_sender(self, base_url, ws_url, alice, bob, alice_headers, bob_headers):
        _ensure_friends(base_url, alice_headers, bob_headers)

        async def run():
            uri_bob = f"{ws_url}/api/ws?token={bob['token']}"
            async with websockets.connect(uri_bob, open_timeout=15) as ws_bob:
                await asyncio.sleep(0.4)
                # Bob sends a message to Alice
                requests.post(f"{base_url}/api/messages", headers=bob_headers,
                              json={"to_user_id": alice["user"]["id"], "type": "text",
                                    "text": f"readme-{uuid.uuid4().hex[:6]}"}, timeout=10)
                # drain message:new that bob may receive about his own send (none expected) and any noise
                # Alice marks read
                rr = requests.post(f"{base_url}/api/chats/{bob['user']['id']}/read",
                                   headers=alice_headers, timeout=10)
                assert rr.status_code == 200

                got = None
                try:
                    while True:
                        raw = await asyncio.wait_for(ws_bob.recv(), timeout=5)
                        data = json.loads(raw)
                        if data.get("type") == "messages:read":
                            got = data
                            break
                except asyncio.TimeoutError:
                    pass
                assert got and got["by"] == alice["user"]["id"]
        asyncio.run(run())
