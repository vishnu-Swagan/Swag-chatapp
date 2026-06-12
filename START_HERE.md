# Swag-Chat — Emergent-Free Edition

This project has been fully migrated off Emergent.sh. No Emergent credits,
keys, or libraries are needed anymore. You own 100% of it.

## What changed
1. `backend/routes/verification.py` — the AI ID-verification now calls
   OpenAI directly (same gpt-4o model) using YOUR own OPENAI_API_KEY.
   Previously it went through Emergent's billing meter.
2. `backend/config.py` — `EMERGENT_LLM_KEY` replaced with `OPENAI_API_KEY`.
3. `backend/requirements.txt` — `emergentintegrations` and Emergent's
   custom litellm wheel removed. Old file kept as
   `requirements.emergent-backup.txt` for reference.
4. Added `.env.example` files for backend and frontend.

## What you need (one-time)
- MongoDB: easiest is a free MongoDB Atlas cluster (cloud.mongodb.com),
  or local: `brew install mongodb-community`
- OpenAI API key: platform.openai.com -> API keys (pay-per-use, pennies;
  only the ID-verification feature uses it — normal chatting is free)

## Run the backend
    cd backend
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    cp .env.example .env   # then edit .env with real values
    uvicorn server:app --reload --port 8001

## Run the mobile app
    cd frontend
    cp .env.example .env   # point EXPO_PUBLIC_BACKEND_URL at your backend
    yarn install   (or: npm install)
    npx expo start

## Cowork prompt (paste this into Claude Cowork)
"Open the Swag-Chat folder. Follow START_HERE.md: set up a Python venv for
the backend, install dependencies, help me create the .env files (ask me for
my MongoDB URL and OpenAI key), start the backend on port 8001, then install
the frontend dependencies and start Expo. Explain each step simply."
