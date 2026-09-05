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
from app.core.config import Settings  # noqa: E402
from app.features.auth.identifiers import (  # noqa: E402
    InvalidPhoneNumberError,
    mask_phone,
    normalise_phone,
)
from app.features.auth.schemas import SessionResponse, UserResponse  # noqa: E402
from app.features.auth.service import InvalidCredentialsError  # noqa: E402
from app.main import app  # noqa: E402

VALID_PHONE = "9876543210"
VALID_EMAIL = "test@example.com"
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


def test_mask_phone_hides_the_middle():
    assert mask_phone(VALID_PHONE) == "98******10"


# -- settings --------------------------------------------------------------


def test_comma_separated_cors_origins_load_from_a_dotenv_file(tmp_path):
    """Regression: pydantic-settings JSON-decodes list fields from .env.

    Without NoDecode on cors_origins this raises SettingsError at import time,
    so the whole app fails to boot the moment CORS_ORIGINS is set.
    """
    env_file = tmp_path / ".env"
    env_file.write_text(
        "SUPABASE_URL=https://test-ref.supabase.co/\n"
        "SUPABASE_PUBLISHABLE_KEY=sb_publishable_test\n"
        "SUPABASE_SECRET_KEY=sb_secret_test\n"
        "SUPABASE_JWKS_URL=https://test-ref.supabase.co/auth/v1/.well-known/jwks.json\n"
        "CORS_ORIGINS=http://localhost:8081, http://192.168.0.215:8081\n",
        encoding="utf-8",
    )

    settings = Settings(_env_file=str(env_file))

    assert settings.cors_origins == [
        "http://localhost:8081",
        "http://192.168.0.215:8081",
    ]
    # Trailing slash stripped, so auth_base_url never doubles up.
    assert settings.auth_base_url == "https://test-ref.supabase.co/auth/v1"


# -- request validation ----------------------------------------------------


class _FakeAuth:
    """Stands in for SupabaseAuthClient. Records calls, returns a fixed session."""

    def __init__(self, *, fail: bool = False):
        self.fail = fail
        self.calls: list[tuple[str, dict]] = []

    async def sign_in(self, **kwargs) -> SessionResponse:
        self.calls.append(("sign_in", kwargs))
        if self.fail:
            raise InvalidCredentialsError("Incorrect email or password.")
        return SessionResponse(
            access_token="access",
            refresh_token="refresh",
            expires_in=3600,
            user=UserResponse(
                id="user-1",
                full_name="Test User",
                phone="+919876543210",
                contact_email=VALID_EMAIL,
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
            json={"email": VALID_EMAIL, "password": VALID_PASSWORD},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["access_token"] == "access"
    # The client must never receive Supabase's own identifiers or keys.
    assert "supabase" not in response.text.lower()


def test_login_rejects_unknown_fields():
    with _client(_FakeAuth()) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": VALID_EMAIL,
                "password": VALID_PASSWORD,
                "is_admin": True,
            },
        )

    assert response.status_code == 422


def test_login_validates_email_server_side():
    with _client(_FakeAuth()) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "not-an-email", "password": VALID_PASSWORD},
        )

    assert response.status_code == 422


def test_bad_credentials_do_not_reveal_whether_the_account_exists():
    with _client(_FakeAuth(fail=True)) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"email": VALID_EMAIL, "password": "wrong pass1"},
        )

    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password."


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


def test_signup_uses_the_email_as_the_login_identifier():
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
    assert signup_call["email"] == "test@example.com"
    assert signup_call["phone"] == VALID_PHONE

    # Signup must sign in with the same address, never a derived identifier.
    signin_call = next(kwargs for name, kwargs in auth.calls if name == "sign_in")
    assert signin_call["email"] == "test@example.com"


def test_protected_route_requires_a_token():
    with _client(_FakeAuth()) as client:
        assert client.get("/api/v1/auth/me").status_code == 401
        assert (
            client.get("/api/v1/auth/me", headers={"Authorization": "Bearer nonsense"}).status_code
            == 401
        )
