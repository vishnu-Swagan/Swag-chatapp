# How to see Swag-Chat on your phone

There is NO single file that installs on both Android and iPhone — that does not
exist (Apple blocks iPhone sideloading entirely). Here are the REAL ways, easiest first.

═══════════════════════════════════════════════════════════════
## OPTION 1 — Expo Go (FREE, both phones, today) ★ recommended first
═══════════════════════════════════════════════════════════════
This shows the live app on your real Android AND iPhone at the same time.

ON YOUR PHONE(S):
  1. Install "Expo Go" from the App Store / Play Store.

ON YOUR MAC (one command at a time in Terminal — ask Claude if stuck):
  # --- start the backend ---
  cd Swag-Chat-main/backend
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt
  cp .env.example .env        # then open .env and fill the 4 values
  uvicorn server:app --reload --host 0.0.0.0 --port 8001

  # --- in a SECOND terminal window, start the app ---
  cd Swag-Chat-main/frontend
  cp .env.example .env
  # IMPORTANT: set EXPO_PUBLIC_BACKEND_URL to your Mac's local IP, not localhost,
  # e.g. http://192.168.1.5:8001  (find it: System Settings > Wi-Fi > Details)
  yarn install        # or: npm install
  npx expo start

  A QR code appears. Scan it with Expo Go (Android) or the Camera app (iPhone).
  Phone and Mac MUST be on the same Wi-Fi.

═══════════════════════════════════════════════════════════════
## OPTION 2 — Real installable .apk (Android only)
═══════════════════════════════════════════════════════════════
Gives you a real file you can install and share with anyone on Android.
Needs a free Expo account (expo.dev).

  cd Swag-Chat-main/frontend
  npm install -g eas-cli
  eas login
  eas build:configure
  eas build --platform android --profile preview

  Expo builds it in the cloud (~10-15 min) and gives you a download link to the .apk.
  NOTE: the backend must be deployed online for the .apk to work away from your Mac
  (see Option 3).

═══════════════════════════════════════════════════════════════
## OPTION 3 — iPhone install + going live (later)
═══════════════════════════════════════════════════════════════
  - iPhone: needs an Apple Developer account ($99/yr) -> TestFlight.
      eas build --platform ios --profile preview
      eas submit --platform ios
  - Backend hosting: deploy the backend folder to Render.com or Railway.app (free
    tiers exist), use a free MongoDB Atlas cluster, then point
    EXPO_PUBLIC_BACKEND_URL at that public URL.

Ask Claude (me) for the exact deploy steps when you reach this stage.
