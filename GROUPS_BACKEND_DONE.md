# ✅ Communities & Groups — BACKEND COMPLETE

Built and tested directly into your app. No Cowork needed.

## What's new (backend)
- `backend/routes/groups.py` — 16 endpoints: create/list/discover/detail/edit/delete
  groups & communities, join/leave, members, add/remove/promote, group messages
  (send/list), mute, read. Realtime fan-out to online members over your existing WebSocket.
- `backend/models.py` — group request models added.
- `backend/server.py` — groups router registered + DB indexes added.

## Tested
Full lifecycle verified with two simulated users: create → discover → join →
message → read → role list → permission enforcement (non-owner blocked from delete). ✅

## What's NEXT (I build these directly too)
- Frontend screens: Communities tab, create screen, group chat, group info/members,
  discover. (Built to match your existing screens + Iris theme.)
- Group voice/video deferred to v1.1 (needs an SFU like LiveKit).

## To run the backend locally (simple)
    cd backend
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    cp .env.example .env     # fill MONGO_URL, DB_NAME, JWT_SECRET, OPENAI_API_KEY
    uvicorn server:app --reload --port 8001

Visit http://localhost:8001/docs to see all the new /groups endpoints live.
