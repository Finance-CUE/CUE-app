"""Signup verification, Google sign-in, password recovery and phone rules.

Two layers: the routes with faked collaborators, and SupabaseAuthClient /
ProfileStore against an httpx MockTransport that plays Supabase. No network.

Run: cd apps/backend && python -m pytest tests/test_auth_flows.py -v
"""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_auth_client, get_current_claims, get_profile_store
from app.core.config import Settings
from app.features.auth.profiles import ProfileStore
from app.features.auth.router import limiter
from app.features.auth.schemas import SessionResponse, UserResponse
from app.features.auth.service import (
    AccountExistsError,
    EmailNotVerifiedError,
    GoogleSignInError,
    InvalidCodeError,
    PhoneAlreadySetError,
    PhoneTakenError,
    SupabaseAuthClient,
    UpstreamAuthError,
    UpstreamRateLimitError,
    WeakPasswordError,
    user_from_claims,
)
from app.main import app

USER_ID = "11111111-1111-4111-8111-111111111111"
OTHER_ID = "22222222-2222-4222-8222-222222222222"
EMAIL = "asha@example.com"
PHONE = "9876543210"
PASSWORD = "correct horse7"
# Async tests run on anyio's pytest plugin (installed with Starlette), asyncio only.
pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


SIGNUP = {"full_name": "Asha Rao", "email": EMAIL, "phone": PHONE, "password": PASSWORD}

SESSION_BODY = {
    "access_token": "access",
    "refresh_token": "refresh",
    "expires_in": 3600,
    "user": {
        "id": USER_ID,
        "email": EMAIL,
        "user_metadata": {"full_name": "Asha Rao", "contact_email": EMAIL, "phone": "+919876543210"},
        "app_metadata": {},
    },
}


# -- route layer -------------------------------------------------------------


class FakeAuth:
    def __init__(self, users: dict | None = None) -> None:
        self.users = users or {}
        self.calls: list[tuple[str, dict]] = []

    def _session(self) -> SessionResponse:
        return SessionResponse(
            access_token="access",
            refresh_token="refresh",
            expires_in=3600,
            user=UserResponse(id=USER_ID, full_name="Asha Rao", phone="", contact_email=EMAIL),
        )

    async def sign_up(self, **kwargs):
        self.calls.append(("sign_up", kwargs))

    async def get_user(self, user_id):
        self.calls.append(("get_user", {"id": user_id}))
        return self.users.get(user_id)

    async def delete_user(self, user_id):
        self.calls.append(("delete_user", {"id": user_id}))

    async def verify_email(self, **kwargs):
        self.calls.append(("verify_email", kwargs))
        return self._session()

    async def resend_verification(self, **kwargs):
        self.calls.append(("resend", kwargs))

    async def sign_in_with_google(self, **kwargs):
        self.calls.append(("google", kwargs))
        return self._session()

    async def request_password_reset(self, **kwargs):
        self.calls.append(("recover", kwargs))

    async def reset_password(self, **kwargs):
        self.calls.append(("reset", kwargs))
        return self._session()

    async def set_phone_metadata(self, user_id, phone):
        self.calls.append(("set_phone_metadata", {"id": user_id, "phone": phone}))


class FakeProfiles:
    def __init__(self, owners: dict[str, str] | None = None, set_error: Exception | None = None):
        self.owners = owners or {}
        self.set_error = set_error
        self.saved: list[tuple[str, str]] = []

    async def phone_owner(self, phone):
        return self.owners.get(phone)

    async def set_phone(self, user_id, phone):
        if self.set_error:
            raise self.set_error
        self.saved.append((user_id, phone))


@pytest.fixture(autouse=True)
def _isolated():
    limiter.enabled = False
    yield
    limiter.enabled = True
    limiter.reset()
    app.dependency_overrides.clear()


def _client(auth: FakeAuth, profiles: FakeProfiles | None = None, claims: dict | None = None):
    app.dependency_overrides[get_auth_client] = lambda: auth
    app.dependency_overrides[get_profile_store] = lambda: profiles or FakeProfiles()
    if claims is not None:
        app.dependency_overrides[get_current_claims] = lambda: claims
    return TestClient(app)


def test_signup_is_refused_when_a_verified_account_holds_the_phone():
    auth = FakeAuth({OTHER_ID: {"email": "someone@example.com", "email_confirmed_at": "2026-10-22"}})
    with _client(auth, FakeProfiles({"+919876543210": OTHER_ID})) as client:
        response = client.post("/api/v1/auth/signup", json=SIGNUP)

    assert response.status_code == 409
    assert response.json()["code"] == "phone_taken"
    assert "already linked" in response.json()["detail"]
    assert not any(name in ("sign_up", "delete_user") for name, _ in auth.calls)


def test_signup_releases_a_phone_held_by_an_abandoned_unverified_signup():
    """Mistyped email first time: the dead account must not lock the number forever."""
    auth = FakeAuth({OTHER_ID: {"email": "typo@example.con", "email_confirmed_at": None}})
    with _client(auth, FakeProfiles({"+919876543210": OTHER_ID})) as client:
        response = client.post("/api/v1/auth/signup", json=SIGNUP)

    assert response.status_code == 201
    assert ("delete_user", {"id": OTHER_ID}) in auth.calls
    assert any(name == "sign_up" for name, _ in auth.calls)


def test_signing_up_again_with_the_same_unverified_email_just_resends():
    auth = FakeAuth({OTHER_ID: {"email": EMAIL.upper(), "email_confirmed_at": None}})
    with _client(auth, FakeProfiles({"+919876543210": OTHER_ID})) as client:
        response = client.post("/api/v1/auth/signup", json=SIGNUP)

    assert response.status_code == 201
    assert not any(name == "delete_user" for name, _ in auth.calls)
    assert any(name == "sign_up" for name, _ in auth.calls)


def test_verify_email_returns_a_session():
    auth = FakeAuth()
    with _client(auth) as client:
        response = client.post("/api/v1/auth/verify-email", json={"email": EMAIL, "code": "123456"})

    assert response.status_code == 200
    assert response.json()["access_token"] == "access"
    assert ("verify_email", {"email": EMAIL, "code": "123456"}) in auth.calls


@pytest.mark.parametrize("code", ["12345", "12a456", "", "12345678901"])
def test_malformed_codes_get_a_plain_english_message(code):
    with _client(FakeAuth()) as client:
        response = client.post("/api/v1/auth/verify-email", json={"email": EMAIL, "code": code})

    assert response.status_code == 422
    assert response.json() == {
        "detail": "Enter the code from your email, using digits only.",
        "code": "invalid_request",
    }


def test_validation_errors_are_one_readable_sentence():
    with _client(FakeAuth()) as client:
        response = client.post("/api/v1/auth/signup", json={**SIGNUP, "password": "lettersonly"})

    assert response.status_code == 422
    assert response.json()["detail"] == "Password must contain at least one letter and one number."


def test_forgot_password_always_answers_204():
    auth = FakeAuth()
    with _client(auth) as client:
        response = client.post("/api/v1/auth/forgot-password", json={"email": EMAIL})

    assert response.status_code == 204
    assert ("recover", {"email": EMAIL}) in auth.calls


def test_reset_password_enforces_the_password_rules():
    with _client(FakeAuth()) as client:
        response = client.post(
            "/api/v1/auth/reset-password",
            json={"email": EMAIL, "code": "123456", "new_password": "short"},
        )

    assert response.status_code == 422
    assert "at least 8 characters" in response.json()["detail"]


def test_google_route_passes_the_id_token_through():
    auth = FakeAuth()
    token = "header.payload.signature-long-enough"
    with _client(auth) as client:
        response = client.post("/api/v1/auth/google", json={"id_token": token})

    assert response.status_code == 200
    assert ("google", {"id_token": token}) in auth.calls


def test_set_phone_requires_a_session():
    with _client(FakeAuth()) as client:
        response = client.put("/api/v1/auth/phone", json={"phone": PHONE})

    assert response.status_code == 401
    assert response.json()["code"] == "session_expired"


def test_set_phone_saves_profile_then_token_metadata():
    auth, profiles = FakeAuth(), FakeProfiles()
    claims = {"sub": USER_ID, "email": EMAIL, "user_metadata": {"name": "Asha Rao"}}
    with _client(auth, profiles, claims) as client:
        response = client.put("/api/v1/auth/phone", json={"phone": PHONE})

    assert response.status_code == 200
    assert response.json()["phone"] == "+919876543210"
    assert profiles.saved == [(USER_ID, "+919876543210")]
    assert ("set_phone_metadata", {"id": USER_ID, "phone": "+919876543210"}) in auth.calls


def test_set_phone_taken_by_someone_else_is_a_clear_409():
    auth = FakeAuth()
    profiles = FakeProfiles(set_error=PhoneTakenError("taken"))
    with _client(auth, profiles, {"sub": USER_ID}) as client:
        response = client.put("/api/v1/auth/phone", json={"phone": PHONE})

    assert response.status_code == 409
    assert response.json()["code"] == "phone_taken"
    assert not any(name == "set_phone_metadata" for name, _ in auth.calls)


def test_me_works_for_google_accounts():
    claims = {"sub": USER_ID, "email": EMAIL, "user_metadata": {"name": "Asha Rao"}}
    with _client(FakeAuth(), claims=claims) as client:
        body = client.get("/api/v1/auth/me").json()

    assert body["full_name"] == "Asha Rao"
    assert body["contact_email"] == EMAIL
    assert body["phone"] == ""


# -- Supabase client layer ---------------------------------------------------


def _settings() -> Settings:
    return Settings()


def _auth_client(handler) -> tuple[SupabaseAuthClient, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def record(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(record))
    return SupabaseAuthClient(_settings(), client), seen


def _body(request: httpx.Request) -> dict:
    return json.loads(request.content or b"{}")


async def test_sign_up_uses_the_public_endpoint_so_supabase_emails_a_code():
    auth, seen = _auth_client(lambda r: httpx.Response(200, json={"id": USER_ID, "identities": [{}]}))

    await auth.sign_up(email=EMAIL, phone=PHONE, password=PASSWORD, full_name="Asha Rao")

    assert seen[0].url.path == "/auth/v1/signup"
    # The publishable key, never the secret one, and no confirm-on-trust flag.
    assert seen[0].headers["apikey"] == "sb_publishable_test"
    assert "authorization" not in seen[0].headers
    body = _body(seen[0])
    assert "email_confirm" not in body
    assert body["data"] == {"full_name": "Asha Rao", "contact_email": EMAIL, "phone": "+919876543210"}


async def test_sign_up_for_a_verified_email_is_account_exists():
    """Supabase hides this behind a fake user with no identities."""
    auth, _ = _auth_client(lambda r: httpx.Response(200, json={"id": "x", "identities": []}))

    with pytest.raises(AccountExistsError):
        await auth.sign_up(email=EMAIL, phone=PHONE, password=PASSWORD, full_name="Asha Rao")


@pytest.mark.parametrize(
    ("status", "body", "error"),
    [
        (422, {"error_code": "weak_password", "msg": "Password is known to be weak"}, WeakPasswordError),
        (429, {"error_code": "over_email_send_rate_limit"}, UpstreamRateLimitError),
        (500, {"msg": "Error sending confirmation email"}, UpstreamAuthError),
        (500, {"msg": "Database error saving new user"}, PhoneTakenError),
    ],
)
async def test_sign_up_failures_map_to_specific_errors(status, body, error):
    auth, _ = _auth_client(lambda r: httpx.Response(status, json=body))

    with pytest.raises(error):
        await auth.sign_up(email=EMAIL, phone=PHONE, password=PASSWORD, full_name="Asha Rao")


async def test_unverified_login_resends_the_code_and_says_so():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/token"):
            return httpx.Response(400, json={"error_code": "email_not_confirmed", "msg": "Email not confirmed"})
        return httpx.Response(200, json={})

    auth, seen = _auth_client(handler)

    with pytest.raises(EmailNotVerifiedError) as caught:
        await auth.sign_in(email=EMAIL, password=PASSWORD)

    assert "sent a new code" in str(caught.value)
    assert seen[1].url.path == "/auth/v1/resend"
    assert _body(seen[1]) == {"type": "signup", "email": EMAIL}


async def test_wrong_code_is_invalid_code():
    auth, _ = _auth_client(lambda r: httpx.Response(403, json={"error_code": "otp_expired"}))

    with pytest.raises(InvalidCodeError):
        await auth.verify_email(email=EMAIL, code="123456")


async def test_reset_password_verifies_then_sets_the_password_with_that_session():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/verify"):
            return httpx.Response(200, json=SESSION_BODY)
        return httpx.Response(200, json={"id": USER_ID})

    auth, seen = _auth_client(handler)

    session = await auth.reset_password(email=EMAIL, code="123456", new_password="new pass99")

    assert session.access_token == "access"
    assert _body(seen[0]) == {"type": "recovery", "email": EMAIL, "token": "123456"}
    assert seen[1].method == "PUT" and seen[1].url.path == "/auth/v1/user"
    assert seen[1].headers["authorization"] == "Bearer access"
    assert _body(seen[1]) == {"password": "new pass99"}


async def test_reusing_the_old_password_is_explained():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/verify"):
            return httpx.Response(200, json=SESSION_BODY)
        return httpx.Response(422, json={"error_code": "same_password"})

    auth, _ = _auth_client(handler)

    with pytest.raises(WeakPasswordError, match="different from your old one"):
        await auth.reset_password(email=EMAIL, code="123456", new_password="new pass99")


async def test_google_sign_in_uses_the_id_token_grant():
    auth, seen = _auth_client(lambda r: httpx.Response(200, json=SESSION_BODY))

    await auth.sign_in_with_google(id_token="google-id-token")

    assert seen[0].url.params["grant_type"] == "id_token"
    assert _body(seen[0]) == {"provider": "google", "id_token": "google-id-token"}


async def test_rejected_google_token_is_a_google_error():
    auth, _ = _auth_client(lambda r: httpx.Response(400, json={"msg": "Unacceptable audience"}))

    with pytest.raises(GoogleSignInError):
        await auth.sign_in_with_google(id_token="google-id-token")


async def test_logout_signs_out_only_this_device():
    """Supabase's default scope is global, which would sign out every phone."""
    auth, seen = _auth_client(lambda r: httpx.Response(204))

    await auth.sign_out(access_token="access")

    assert seen[0].url.params["scope"] == "local"


def test_google_user_payload_maps_name_and_email():
    user = user_from_claims({"id": USER_ID, "email": EMAIL, "user_metadata": {"name": "Asha Rao"}})

    assert (user.full_name, user.contact_email, user.phone) == ("Asha Rao", EMAIL, "")


# -- profile store -----------------------------------------------------------


def _profiles(handler) -> tuple[ProfileStore, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def record(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    return ProfileStore(_settings(), httpx.AsyncClient(transport=httpx.MockTransport(record))), seen


async def test_set_phone_only_fills_an_empty_phone_for_that_user():
    store, seen = _profiles(lambda r: httpx.Response(200, json=[{"id": USER_ID}]))

    await store.set_phone(USER_ID, "+919876543210")

    assert seen[0].method == "PATCH"
    assert seen[0].url.params["id"] == f"eq.{USER_ID}"
    assert seen[0].url.params["phone"] == "is.null"


async def test_set_phone_unique_violation_is_phone_taken():
    store, _ = _profiles(lambda r: httpx.Response(409, json={"code": "23505"}))

    with pytest.raises(PhoneTakenError):
        await store.set_phone(USER_ID, "+919876543210")


async def test_set_phone_when_one_is_already_saved():
    store, _ = _profiles(lambda r: httpx.Response(200, json=[]))

    with pytest.raises(PhoneAlreadySetError):
        await store.set_phone(USER_ID, "+919876543210")


async def test_phone_owner_lookup():
    store, seen = _profiles(lambda r: httpx.Response(200, json=[{"id": OTHER_ID}]))

    assert await store.phone_owner("+919876543210") == OTHER_ID
    assert seen[0].url.params["phone"] == "eq.+919876543210"
