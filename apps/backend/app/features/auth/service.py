"""Supabase Auth gateway.

The only module in the codebase that holds Supabase credentials in flight.
Nothing here returns a Supabase URL, key, or raw upstream payload to a caller -
responses are mapped onto our own schemas so an upstream change or an upstream
error message can never leak through to the app.
"""

import logging
from typing import Any

import httpx

from app.core.config import Settings
from app.features.auth.identifiers import mask_phone, to_auth_identifier, to_e164
from app.features.auth.schemas import SessionResponse, UserResponse

logger = logging.getLogger(__name__)


class AuthError(Exception):
    """Base class for auth failures that map to a client-visible status."""


class InvalidCredentialsError(AuthError):
    """Wrong phone/password, or no such account. Deliberately indistinguishable."""


class AccountExistsError(AuthError):
    """Signup for a phone number that already has an account."""


class UpstreamAuthError(AuthError):
    """Supabase was unreachable or returned something we do not handle."""


class UpstreamRateLimitError(AuthError):
    """Supabase rejected us for rate limiting."""


class SupabaseAuthClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client

    # -- headers -----------------------------------------------------------

    def _public_headers(self) -> dict[str, str]:
        """For the user-facing grant endpoints. Publishable key is safe here."""
        return {
            "apikey": self._settings.supabase_publishable_key,
            "Content-Type": "application/json",
        }

    def _admin_headers(self) -> dict[str, str]:
        """For admin endpoints only. This key bypasses RLS - never log it."""
        return {
            "apikey": self._settings.supabase_secret_key,
            "Authorization": f"Bearer {self._settings.supabase_secret_key}",
            "Content-Type": "application/json",
        }

    # -- requests ----------------------------------------------------------

    async def _post(
        self,
        path: str,
        *,
        headers: dict[str, str],
        json: dict[str, Any],
        params: dict[str, str] | None = None,
    ) -> httpx.Response:
        url = f"{self._settings.auth_base_url}{path}"
        try:
            return await self._client.post(url, headers=headers, json=json, params=params)
        except httpx.HTTPError as exc:
            # Log the class of failure, never the payload - it holds passwords.
            logger.error("supabase auth request failed: %s", type(exc).__name__)
            raise UpstreamAuthError("Authentication service unavailable.") from exc

    # -- operations --------------------------------------------------------

    async def sign_up(
        self,
        *,
        phone: str,
        password: str,
        full_name: str,
        contact_email: str,
    ) -> None:
        """Create the account. Does not sign the user in.

        Uses the admin endpoint so the account is usable immediately without an
        email round-trip. phone_verified stays false: nobody has proved they own
        this number, and flipping it is what SMS verification will do later.
        """
        identifier = to_auth_identifier(phone, self._settings.auth_identifier_domain)

        response = await self._post(
            "/admin/users",
            headers=self._admin_headers(),
            json={
                "email": identifier,
                "password": password,
                "email_confirm": True,
                "user_metadata": {
                    "full_name": full_name,
                    "contact_email": contact_email,
                    "phone": to_e164(phone),
                },
                "app_metadata": {
                    # Anything security-relevant belongs in app_metadata, which
                    # only the secret key can change. user_metadata is writable
                    # by the account holder once client SDKs are ever used.
                    "phone_verified": False,
                    "signup_method": "phone_password",
                },
            },
        )

        if response.status_code in (200, 201):
            logger.info("account created for %s", mask_phone(phone))
            return

        if response.status_code in (400, 422) and _mentions_existing_user(response):
            raise AccountExistsError("An account already exists for this mobile number.")

        if response.status_code == 429:
            raise UpstreamRateLimitError("Too many attempts. Please try again shortly.")

        logger.error("supabase signup failed: status=%s", response.status_code)
        raise UpstreamAuthError("Could not create the account right now.")

    async def sign_in(self, *, phone: str, password: str) -> SessionResponse:
        identifier = to_auth_identifier(phone, self._settings.auth_identifier_domain)

        response = await self._post(
            "/token",
            headers=self._public_headers(),
            params={"grant_type": "password"},
            json={"email": identifier, "password": password},
        )

        if response.status_code == 200:
            return _to_session(response.json())

        if response.status_code in (400, 401, 403):
            # Unknown account and wrong password return the same error, so the
            # endpoint cannot be used to discover which numbers are registered.
            raise InvalidCredentialsError("Incorrect mobile number or password.")

        if response.status_code == 429:
            raise UpstreamRateLimitError("Too many attempts. Please try again shortly.")

        logger.error("supabase login failed: status=%s", response.status_code)
        raise UpstreamAuthError("Could not sign in right now.")

    async def refresh(self, *, refresh_token: str) -> SessionResponse:
        response = await self._post(
            "/token",
            headers=self._public_headers(),
            params={"grant_type": "refresh_token"},
            json={"refresh_token": refresh_token},
        )

        if response.status_code == 200:
            return _to_session(response.json())

        if response.status_code in (400, 401, 403):
            raise InvalidCredentialsError("Session expired. Please sign in again.")

        logger.error("supabase refresh failed: status=%s", response.status_code)
        raise UpstreamAuthError("Could not refresh the session.")

    async def sign_out(self, *, access_token: str) -> None:
        """Revoke the refresh token upstream. Best effort by design.

        A client that has already discarded its tokens is signed out from its own
        point of view; an upstream hiccup must not turn logout into an error the
        user has to retry.
        """
        headers = self._public_headers() | {"Authorization": f"Bearer {access_token}"}
        try:
            await self._post("/logout", headers=headers, json={})
        except UpstreamAuthError:
            logger.warning("logout revocation failed upstream; client tokens discarded")


def _mentions_existing_user(response: httpx.Response) -> bool:
    try:
        body = response.json()
    except ValueError:
        return False

    message = " ".join(
        str(body.get(key, "")) for key in ("msg", "message", "error_description", "error")
    ).lower()
    return "already" in message and ("registered" in message or "exists" in message)


def _to_session(payload: dict[str, Any]) -> SessionResponse:
    user = payload.get("user") or {}
    metadata = user.get("user_metadata") or {}
    app_metadata = user.get("app_metadata") or {}

    return SessionResponse(
        access_token=payload["access_token"],
        refresh_token=payload["refresh_token"],
        expires_in=int(payload.get("expires_in", 3600)),
        user=UserResponse(
            id=str(user.get("id", "")),
            full_name=str(metadata.get("full_name", "")),
            phone=str(metadata.get("phone", "")),
            contact_email=metadata.get("contact_email"),
            phone_verified=bool(app_metadata.get("phone_verified", False)),
        ),
    )
