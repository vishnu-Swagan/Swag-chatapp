"""Iteration 6: Owner-only admin oversight + app version management tests.

Covers:
- POST /api/auth/signup populates signup_ip/user_agent/geo
- POST /api/auth/login populates last_login_* and login_history (capped at 50)
- GET  /api/app/version PUBLIC (no auth)
- GET  /api/admin/app-version (admin-only, 403 for non-admin)
- POST /api/admin/app-version updates policy + audit log + public reflects
- GET  /api/admin/users/{id}/dossier (default scrubbed) vs ?reveal=true&reason=...
- GET  /api/admin/users/{id}/dossier?reveal=true (no reason) → 400
- GET  /api/admin/users/{id}/dossier as manager → 403
- GET  /api/admin/activity & ?since=...
- POST /api/admin/geoip-lookup (admin-only, 403 for non-admin)
"""
import os
import re
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")

ADMIN_EMAIL = "admin@swagchat.app"
ADMIN_PW = "Admin@1234"
MANAGER_EMAIL = "manager@swagchat.app"
MANAGER_PW = "Manager@1234"
ALICE_EMAIL = "alice@test.com"
ALICE_PW = "Test@1234"


def _login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def admin_session():
    j = _login(ADMIN_EMAIL, ADMIN_PW)
    return {"token": j["token"], "user": j["user"]}


@pytest.fixture(scope="module")
def manager_session():
    j = _login(MANAGER_EMAIL, MANAGER_PW)
    return {"token": j["token"], "user": j["user"]}


@pytest.fixture(scope="module")
def alice_session():
    j = _login(ALICE_EMAIL, ALICE_PW)
    return {"token": j["token"], "user": j["user"]}


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Signup IP / Login IP tracking ----------

class TestSignupAndLoginTracking:
    def test_signup_populates_signup_fields(self, admin_session):
        rand = uuid.uuid4().hex[:8]
        email = f"TEST_oversight_{rand}@test.com"
        username = f"tovs_{rand}"
        body = {"email": email, "username": username, "password": "Test@1234", "accepted_terms": True}
        r = requests.post(f"{BASE_URL}/api/auth/signup", json=body, timeout=15)
        assert r.status_code == 200, r.text
        uid = r.json()["user"]["id"]

        # Fetch via dossier with reveal=true to see raw signup_ip / signup_geo / UA
        d = requests.get(
            f"{BASE_URL}/api/admin/users/{uid}/dossier",
            params={"reveal": "true", "reason": "iter6_signup_check"},
            headers=_h(admin_session["token"]),
            timeout=15,
        )
        assert d.status_code == 200, d.text
        u = d.json()["user"]
        assert "signup_ip" in u and u["signup_ip"], "signup_ip missing on user"
        assert "signup_user_agent" in u, "signup_user_agent missing on user"
        assert "signup_geo" in u and isinstance(u["signup_geo"], dict), "signup_geo missing/wrong type"

    def test_login_populates_last_login_and_history_cap(self, alice_session, admin_session):
        # Perform a fresh login so last_login_at advances.
        before_login_iso = "1970-01-01T00:00:00+00:00"
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ALICE_EMAIL, "password": ALICE_PW}, timeout=15)
        assert r.status_code == 200
        uid = r.json()["user"]["id"]

        d = requests.get(
            f"{BASE_URL}/api/admin/users/{uid}/dossier",
            params={"reveal": "true", "reason": "iter6_login_check"},
            headers=_h(admin_session["token"]),
            timeout=15,
        )
        assert d.status_code == 200, d.text
        u = d.json()["user"]
        assert u.get("last_login_ip"), "last_login_ip missing"
        assert "last_login_user_agent" in u
        assert isinstance(u.get("last_login_geo"), dict)
        assert u.get("last_login_at") and u["last_login_at"] > before_login_iso
        hist = u.get("login_history") or []
        assert isinstance(hist, list)
        assert len(hist) <= 50, f"login_history exceeded 50 ({len(hist)})"
        if hist:
            entry = hist[-1]
            assert "at" in entry and "ip" in entry and "user_agent" in entry


# ---------- App Version (public + admin) ----------

class TestAppVersion:
    def test_public_app_version_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/app/version", timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ("current_version", "min_supported_version", "force_update", "message",
                    "release_notes", "ios_url", "android_url"):
            assert key in body, f"missing {key}"
        assert isinstance(body["force_update"], bool)

    def test_admin_app_version_requires_admin(self, manager_session):
        r = requests.get(f"{BASE_URL}/api/admin/app-version", headers=_h(manager_session["token"]), timeout=10)
        assert r.status_code == 403, f"expected 403 manager, got {r.status_code} {r.text}"

    def test_admin_can_get_app_version(self, admin_session):
        r = requests.get(f"{BASE_URL}/api/admin/app-version", headers=_h(admin_session["token"]), timeout=10)
        assert r.status_code == 200
        assert "current_version" in r.json()

    def test_admin_post_app_version_and_public_reflects(self, admin_session):
        body = {
            "current_version": "1.1.0",
            "min_supported_version": "1.0.0",
            "force_update": False,
            "message": "New voice notes!",
            "release_notes": "Faster sync",
        }
        r = requests.post(f"{BASE_URL}/api/admin/app-version",
                          json=body, headers=_h(admin_session["token"]), timeout=15)
        assert r.status_code == 200, r.text
        saved = r.json()
        assert saved["current_version"] == "1.1.0"
        assert saved["message"] == "New voice notes!"
        assert saved["release_notes"] == "Faster sync"

        # Public reflects
        time.sleep(0.3)
        p = requests.get(f"{BASE_URL}/api/app/version", timeout=10).json()
        assert p["current_version"] == "1.1.0"
        assert p["message"] == "New voice notes!"
        assert p["release_notes"] == "Faster sync"

        # Restore baseline so other tests / UI behave normally
        restore = {
            "current_version": "1.0.0", "min_supported_version": "1.0.0",
            "force_update": False, "message": "", "release_notes": "",
        }
        requests.post(f"{BASE_URL}/api/admin/app-version",
                      json=restore, headers=_h(admin_session["token"]), timeout=15)


# ---------- Dossier ----------

class TestDossier:
    @pytest.fixture(scope="class")
    def target_uid(self, alice_session):
        return alice_session["user"]["id"]

    def test_dossier_default_scrubs_pii(self, admin_session, target_uid):
        r = requests.get(f"{BASE_URL}/api/admin/users/{target_uid}/dossier",
                         headers=_h(admin_session["token"]), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["revealed"] is False
        u = body["user"]
        # email + IPs + profile blob must be stripped
        assert "email" not in u, "email leaked in default dossier"
        assert "signup_ip" not in u
        assert "last_login_ip" not in u
        assert body.get("profile_image_base64") in (None, ""), "profile image leaked"
        # verifications: id_image_base64/selfie_base64 stripped
        for v in body.get("verifications", []):
            assert "id_image_base64" not in v
            assert "selfie_base64" not in v
        # media: blobs stripped
        for m in body.get("media_messages", []):
            assert "image_base64" not in m
            assert "video_base64" not in m
        # stats present
        assert "stats" in body
        for k in ("friends", "messages_sent", "messages_received",
                  "statuses_count", "verification_attempts",
                  "reports_against_count", "reports_filed_count"):
            assert k in body["stats"], f"missing stat {k}"
        # security events: IPs masked when present
        for ev in body.get("security_events", []):
            ip = ev.get("ip")
            if ip and "." in ip and any(c.isdigit() for c in ip):
                # IPv4 masked → A.B.x.x
                assert re.match(r"^\d+\.\d+\.x\.x$", ip), f"unmasked ip {ip}"

    def test_dossier_reveal_returns_pii_and_audits(self, admin_session, target_uid):
        reason = "iter6_reveal_test"
        r = requests.get(f"{BASE_URL}/api/admin/users/{target_uid}/dossier",
                         params={"reveal": "true", "reason": reason},
                         headers=_h(admin_session["token"]), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["revealed"] is True
        u = body["user"]
        assert u.get("email"), "email missing on reveal"
        # last_login_ip should be a raw value (not masked) on reveal
        if u.get("last_login_ip"):
            assert "x" not in u["last_login_ip"].lower(), "last_login_ip looks masked even on reveal"

        # Audit log entry should exist via db check (motor not needed: use pymongo sync)
        try:
            from pymongo import MongoClient
            mongo_url = os.environ.get("MONGO_URL")
            db_name = os.environ.get("DB_NAME")
            if mongo_url and db_name:
                cli = MongoClient(mongo_url)
                d = cli[db_name]
                entry = d.admin_audit.find_one(
                    {"action": "dossier_revealed", "target_id": target_uid, "reason": reason}
                )
                assert entry is not None, "admin_audit dossier_revealed entry not created"
        except ImportError:
            # If pymongo missing in this env, fall back to just trusting endpoint behavior
            pass

    def test_dossier_reveal_without_reason_is_400(self, admin_session, target_uid):
        r = requests.get(f"{BASE_URL}/api/admin/users/{target_uid}/dossier",
                         params={"reveal": "true"},
                         headers=_h(admin_session["token"]), timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"

    def test_dossier_reveal_short_reason_is_400(self, admin_session, target_uid):
        r = requests.get(f"{BASE_URL}/api/admin/users/{target_uid}/dossier",
                         params={"reveal": "true", "reason": "ab"},
                         headers=_h(admin_session["token"]), timeout=15)
        assert r.status_code == 400

    def test_dossier_manager_is_forbidden(self, manager_session, target_uid):
        r = requests.get(f"{BASE_URL}/api/admin/users/{target_uid}/dossier",
                         headers=_h(manager_session["token"]), timeout=15)
        assert r.status_code == 403, f"expected 403 for manager, got {r.status_code} {r.text}"


# ---------- Activity feed ----------

class TestActivity:
    def test_activity_returns_events_sorted_desc(self, admin_session, alice_session):
        # Ensure at least one fresh login event exists
        requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ALICE_EMAIL, "password": ALICE_PW}, timeout=10)
        time.sleep(0.3)
        r = requests.get(f"{BASE_URL}/api/admin/activity",
                         params={"limit": 50}, headers=_h(admin_session["token"]), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        events = data.get("events")
        assert isinstance(events, list)
        assert len(events) > 0, "expected non-empty activity feed"
        # check sort desc
        ats = [e.get("at") or "" for e in events]
        assert ats == sorted(ats, reverse=True), "events not sorted by 'at' desc"
        # check kind & enrichment fields
        kinds = {e.get("kind") for e in events}
        # Should at least include a login_success since alice just logged in
        assert any(k in kinds for k in ("login_success", "signup", "verification", "status", "report")), \
            f"no expected kinds in {kinds}"
        # every event has user_id (or reported_id) and username (when user_id present in users)
        for e in events:
            assert "kind" in e and "at" in e
            if e.get("user_id"):
                # username could be None for deleted/anonymized users, so just check key exists
                assert "username" in e

    def test_activity_since_filter(self, admin_session):
        future_iso = "2999-01-01T00:00:00"
        r = requests.get(f"{BASE_URL}/api/admin/activity",
                         params={"since": future_iso, "limit": 50},
                         headers=_h(admin_session["token"]), timeout=15)
        assert r.status_code == 200
        events = r.json().get("events", [])
        # Since the filter is in the far future, expect zero (or near zero from non-time-filtered collections)
        # NOTE: oversight.py applies 'since' to security_events/verifications/statuses/reports → all empty.
        assert events == [], f"expected empty events for future since, got {len(events)}"

    def test_activity_requires_admin(self, manager_session):
        r = requests.get(f"{BASE_URL}/api/admin/activity",
                         headers=_h(manager_session["token"]), timeout=10)
        assert r.status_code == 403


# ---------- GeoIP lookup ----------

class TestGeoIPLookup:
    def test_geoip_lookup_admin(self, admin_session):
        r = requests.post(f"{BASE_URL}/api/admin/geoip-lookup",
                          params={"ip": "8.8.8.8"}, headers=_h(admin_session["token"]), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # Expect a dict (may be empty {} if ip-api was rate-limited, but normally has country)
        assert isinstance(data, dict)
        # If non-empty, must look like geoip output
        if data:
            assert "country" in data or "city" in data or "isp" in data

    def test_geoip_lookup_caches(self, admin_session):
        # 2nd call should be near-instant; we just verify same shape and 200
        r1 = requests.post(f"{BASE_URL}/api/admin/geoip-lookup",
                           params={"ip": "8.8.8.8"}, headers=_h(admin_session["token"]), timeout=10)
        r2 = requests.post(f"{BASE_URL}/api/admin/geoip-lookup",
                           params={"ip": "8.8.8.8"}, headers=_h(admin_session["token"]), timeout=10)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json() == r2.json()

    def test_geoip_lookup_non_admin_forbidden(self, manager_session):
        r = requests.post(f"{BASE_URL}/api/admin/geoip-lookup",
                          params={"ip": "8.8.8.8"}, headers=_h(manager_session["token"]), timeout=10)
        assert r.status_code == 403
