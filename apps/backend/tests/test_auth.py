"""Auth checks that need no Supabase project and no network.

Run: cd apps/backend && pytest
"""

import os

import pytest

os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("SUPABASE_URL", "https://test-ref.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
os.environ.setdefault("SUPABASE_SECRET_KEY", "sb_secret_test")
os.environ.setdefault(
    "SUPABASE_JWKS_URL",
    "https://test-ref.supabase.co/auth/v1/.well-known/jwks.json",
)

from fastapi.testclient import TestClient  # noqa: E402

from app.api.dependencies.auth import get_auth_client  # noqa: E402
from app.features.auth.identifiers import (  # noqa: E402
    InvalidPhoneNumberError,
    mask_phone,
    normalise_phone,
    to_auth_identifier,
)
from app.features.auth.schemas import SessionResponse, UserResponse  # noqa: E402
from app.features.auth.service import InvalidCredentialsError  # noqa: E402
from app.main import app  # noqa: E402

VALID_PHONE = "9876543210"
VALID_PASSWORD = "correct horse7"


# -- phone normalisation ---------------------------------------------------


def test_normalise_phone_strips_formatting():
    assert normalise_phone(" 98765-43210 ") == VALID_PHONE


@pytest.mark.parametrize(
    "bad",
    [
        "",
        "12345",
        "98765432101",
        "5876543210",
        "9999999999",
        "abcdefghij",
    ],
)
def test_normalise_phone_rejects(bad):
    with pytest.raises(InvalidPhoneNumberError):
        normalise_phone(bad)


def test_auth_identifier_is_deterministic():
    first = to_auth_identifier(VALID_PHONE, "phone.cue.invalid")
    assert first == to_auth_identifier(VALID_PHONE, "phone.cue.invalid")
    assert first == "919876543210@phone.cue.invalid"


def test_mask_phone_hides_the_middle():
    assert mask_phone(VALID_PHONE) == "98******10"


# -- request validation ----------------------------------------------------


class _FakeAuth:
    """Stands in for SupabaseAuthClient. Records calls, returns a fixed session."""

    def __init__(self, *, fail: bool = False):
        self.fail = fail
        self.calls: list[tuple[str, dict]] = []

    async def sign_in(self, **kwargs) -> SessionResponse:
        self.calls.append(("sign_in", kwargs))
        if self.fail:
            raise InvalidCredentialsError("Incorrect mobile number or password.")
        return SessionResponse(
            access_token="access",
            refresh_token="refresh",
            expires_in=3600,
            user=UserResponse(
                id="user-1",
                full_name="Test User",
                phone="+919876543210",
                contact_email="test@example.com",
            ),
        )

    async def sign_up(self, **kwargs) -> None:
        self.calls.append(("sign_up", kwargs))


def _client(auth: _FakeAuth) -> TestClient:
    app.dependency_overrides[get_auth_client] = lambda: auth
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def test_login_returns_a_session():
    with _client(_FakeAuth()) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"phone": VALID_PHONE, "password": VALID_PASSWORD},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["access_token"] == "access"
    # The client must never receive Supabase's own identifiers or keys.
    assert "supabase" not in response.text.lower()
    assert "@phone.cue.invalid" not in response.text


def test_login_rejects_unknown_fields():
    with _client(_FakeAuth()) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={
                "phone": VALID_PHONE,
                "password": VALID_PASSWORD,
                "is_admin": True,
            },
        )

    assert response.status_code == 422


def test_login_validates_phone_server_side():
    with _client(_FakeAuth()) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"phone": "1234567890", "password": VALID_PASSWORD},
        )

    assert response.status_code == 422


def test_bad_credentials_do_not_reveal_whether_the_account_exists():
    with _client(_FakeAuth(fail=True)) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"phone": VALID_PHONE, "password": "wrong pass1"},
        )

    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect mobile number or password."


@pytest.mark.parametrize(
    "weak",
    ["short1", "nodigitshere", "12345678", "a1"],
)
def test_signup_rejects_weak_passwords(weak):
    with _client(_FakeAuth()) as client:
        response = client.post(
            "/api/v1/auth/signup",
            json={
                "full_name": "Test User",
                "email": "test@example.com",
                "phone": VALID_PHONE,
                "password": weak,
            },
        )

    assert response.status_code == 422


def test_signup_passes_the_contact_email_through_separately():
    auth = _FakeAuth()
    with _client(auth) as client:
        response = client.post(
            "/api/v1/auth/signup",
            json={
                "full_name": "Test User",
                "email": "test@example.com",
                "phone": VALID_PHONE,
                "password": VALID_PASSWORD,
            },
        )

    assert response.status_code == 201
    signup_call = next(kwargs for name, kwargs in auth.calls if name == "sign_up")
    assert signup_call["contact_email"] == "test@example.com"
    assert signup_call["phone"] == VALID_PHONE


def test_protected_route_requires_a_token():
    with _client(_FakeAuth()) as client:
        assert client.get("/api/v1/auth/me").status_code == 401
        assert (
            client.get("/api/v1/auth/me", headers={"Authorization": "Bearer nonsense"}).status_code
            == 401
        )
