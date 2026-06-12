# Swag Chat (formerly MonoChat) — PRD & Progress

## Original Problem Statement
Build a mobile app: Web Chat with all functionality of WhatsApp. People connect with a unique username instead of phone number. Account created with Email + Password + unique Username. To connect, send a request by typing the exact username; once accepted, both exchange chats, photos, video calls and phone calls through web call. Selfie with face verification matched against an uploaded govt-issued ID based on the user's signup country.

## User Choices
- AI face verification: GPT-4o vision via Emergent LLM key
- Calls: WebRTC peer-to-peer (works on web preview; native needs dev build)
- Real-time chat: WebSocket
- Verification mandatory BEFORE chatting
- Theme: grey / white / black (strict monochrome, see /app/design_guidelines.json)

## Architecture
- Backend: FastAPI (port 8001, /api prefix), MongoDB (motor), JWT auth (bcrypt + PyJWT), WebSocket at /api/ws?token=JWT (chat push + WebRTC signaling relay), GPT-4o vision via emergentintegrations for selfie↔ID matching
- Frontend: Expo SDK 54 + expo-router. Screens: /auth, /verification, /(tabs)/{chats,requests,profile}, /chat/[id], /call/[id]. Contexts: AuthContext (token in SecureStore via @/src/utils/storage), SocketContext (ws + incoming-call overlay). Keyboard: react-native-keyboard-controller.
- Collections: users, verifications, requests, friendships, messages (uuid string ids, no raw ObjectId exposure)

## User Personas
- Privacy-conscious users who want username-based (not phone-based) verified chat

## Implemented (June 2026 — MVP)
- [x] Email/password + unique username signup & login (JWT)
- [x] Mandatory KYC flow: country → ID type (country-specific list, 19 countries) → ID photo → selfie → GPT-4o AI face match → verified flag
- [x] Permission handling for camera (canAskAgain + Open Settings)
- [x] Friend requests by exact username (search, send, accept/reject, pending states, ws push)
- [x] 1-to-1 chat: text + photo (base64), delivery/read ticks, unread badges, real-time via WebSocket, inverted list, online dot
- [x] Voice + video calls: WebRTC P2P with ws signaling (web preview functional; native shows dev-build notice), incoming call overlay, mute/cam toggle
- [x] Profile with verified badge, sign out
- [x] Monochrome design system per design_guidelines.json; testIDs everywhere
- [x] Seeded test users alice_test / bob_test (see /app/memory/test_credentials.md)
- [x] Tested: 30/30 backend pytest + frontend E2E pass (test_reports/iteration_1.json)

## Backlog (prioritized)
- P0: none outstanding
- P1: Native calls via react-native-webrtc in dev build; TURN server for NAT traversal in production; message pagination
- P1: Typing indicators; last-seen/presence broadcasting
- P2: Group chats, voice notes, message delete/edit, status/stories, block & report users, push notifications (on user request), profile photos, friendly 400 for Pydantic 422s, cap image payload size

## Next Tasks
- Gather user feedback on KYC strictness (confidence threshold currently 60)
- Consider TURN credentials for reliable calls beyond same-network peers
