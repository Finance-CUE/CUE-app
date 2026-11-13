"""Supabase Auth gateway.

Nothing here returns a Supabase URL, key, or raw upstream payload to a caller -
responses are mapped onto our own schemas and our own error messages, so an
upstream change or an upstream error string can never leak through to the app.

Account lifecycle:
- Email signup goes through the public /signup endpoint, so Supabase emails a
  one-time code. No session exists until that code is verified.
- Google sign-in trades a Google ID token for a session. An existing account
  with the same email is linked by Supabase, so its data stays attached.
- Password recovery emails a code; verifying it signs the user in and the new
  password is set with that session.
"""

import logging
from typing import Any

import httpx
from fastapi import status

from app.core.config import Settings
from app.features.auth.identifiers import mask_phone, to_e164
from app.features.auth.schemas import SessionResponse, UserResponse

logger = logging.getLogger(__name__)


class AuthError(Exception):
    """Base class for auth failures. Each subclass maps to one HTTP status and code.

    The message is shown to the user as-is, so it must be plain English and must
    never contain upstream text.
    """

    status_code = status.HTTP_400_BAD_REQUEST
    code = "auth_error"


class InvalidCredentialsError(AuthError):
    """Wrong email/password, or no such account. Deliberately indistinguishable."""

    status_code = status.HTTP_401_UNAUTHORIZED
    code = "invalid_credentials"


class SessionExpiredError(AuthError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "session_expired"


class GoogleSignInError(AuthError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "google_sign_in_failed"


class EmailNotVerifiedError(AuthError):
    """Correct password, but the signup code was never entered."""

    status_code = status.HTTP_403_FORBIDDEN
    code = "email_not_verified"


class InvalidCodeError(AuthError):
    code = "invalid_code"


class AccountExistsError(AuthError):
    """Signup for an email address that already has an account."""

    status_code = status.HTTP_409_CONFLICT
    code = "account_exists"


class PhoneTakenError(AuthError):
    """The mobile number is already linked to another verified account."""

    status_code = status.HTTP_409_CONFLICT
    code = "phone_taken"


class PhoneAlreadySetError(AuthError):
    status_code = status.HTTP_409_CONFLICT
    code = "phone_already_set"


class WeakPasswordError(AuthError):
    """Supabase rejected the password as compromised, too weak, or unchanged."""

    code = "weak_password"


class UpstreamRateLimitError(AuthError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "rate_limited"


class UpstreamAuthError(AuthError):
    """Supabase was unreachable or returned something we do not handle."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "auth_unavailable"


# User-facing copy, kept together so wording stays consistent across flows.
MSG_ACCOUNT_EXISTS = (
    "An account already exists for this email. Log in instead, or use "
    "Continue with Google if you signed up that way."
)
MSG_PHONE_TAKEN = (
    "This mobile number is already linked to a CUE account. Log in instead, or "
    "use Forgot password if you can't get in."
)
MSG_INVALID_CODE = (
    "That code is incorrect or has expired. Check the latest email from CUE, "
    "or request a new code."
)
MSG_EMAIL_NOT_VERIFIED = (
    "Please verify your email first. We've sent a new code to your inbox."
)
MSG_EMAIL_SEND_FAILED = (
    "We couldn't send the email right now. Please try again in a few minutes."
)
MSG_TOO_MANY_EMAILS = (
    "Too many emails requested. Please wait a minute and try again."
)
MSG_TOO_MANY_ATTEMPTS = "Too many attempts. Please wait a minute and try again."
MSG_UNAVAILABLE = (
    "CUE's sign-in service isn't responding right now. Please try again in a "
    "few minutes."
)
MSG_BREACHED_PASSWORD = (
    "That password has appeared in a data breach. Please choose a different one."
)
MSG_SAME_PASSWORD = "Your new password must be different from your old one."
MSG_GOOGLE_FAILED = "Google sign-in didn't work. Please try again."


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

    async def _send(
        self,
        method: str,
        path: str,
        *,
        headers: dict[str, str],
        json: dict[str, Any] | None = None,
        params: dict[str, str] | None = None,
    ) -> httpx.Response:
        url = f"{self._settings.auth_base_url}{path}"
        try:
            return await self._client.request(
                method, url, headers=headers, json=json, params=params
            )
        except httpx.HTTPError as exc:
            # Log the class of failure, never the payload - it holds passwords.
            logger.error("supabase auth request failed: %s", type(exc).__name__)
            raise UpstreamAuthError(MSG_UNAVAILABLE) from exc

    async def _post(
        self,
        path: str,
        *,
        headers: dict[str, str],
        json: dict[str, Any],
        params: dict[str, str] | None = None,
    ) -> httpx.Response:
        return await self._send("POST", path, headers=headers, json=json, params=params)

    # -- signup and email verification -------------------------------------

    async def sign_up(
        self,
        *,
        email: str,
        phone: str,
        password: str,
        full_name: str,
    ) -> None:
        """Create the account and email a verification code. Does not sign in.

        Signing up again with an unverified address re-sends the code, so a user
        who lost the first email can simply retry.
        """
        response = await self._post(
            "/signup",
            headers=self._public_headers(),
            json={
                "email": email,
                "password": password,
                "data": {
                    "full_name": full_name,
                    "contact_email": email,
                    "phone": to_e164(phone),
                },
            },
        )

        if response.status_code == 200:
            # An address that is already verified gets an obfuscated user with
            # no identities instead of an error.
            if _json(response).get("identities") == []:
                raise AccountExistsError(MSG_ACCOUNT_EXISTS)
            logger.info("account created, code sent for %s", mask_phone(phone))
            return

        message = _upstream_message(response)

        if response.status_code in (400, 422):
            if _mentions_existing_user(response):
                raise AccountExistsError(MSG_ACCOUNT_EXISTS)
            # Supabase's leaked-password check lives upstream, so this is the
            # only place that knows the password was refused rather than the
            # request being malformed.
            if _mentions_weak_password(response):
                raise WeakPasswordError(MSG_BREACHED_PASSWORD)

        if response.status_code == 429:
            raise UpstreamRateLimitError(MSG_TOO_MANY_EMAILS)

        if "sending" in message and "email" in message:
            logger.error("supabase signup could not send email: status=%s", response.status_code)
            raise UpstreamAuthError(MSG_EMAIL_SEND_FAILED)

        if "database error" in message:
            # The profile trigger hit a unique index the pre-check did not see
            # (a race, or an email held by another profile).
            logger.error("supabase signup hit a profile conflict")
            raise PhoneTakenError(MSG_PHONE_TAKEN)

        logger.error("supabase signup failed: status=%s", response.status_code)
        raise UpstreamAuthError("We couldn't create your account right now. Please try again.")

    async def verify_email(self, *, email: str, code: str) -> SessionResponse:
        """Exchange the emailed signup code for a session. Marks the email verified."""
        response = await self._post(
            "/verify",
            headers=self._public_headers(),
            json={"type": "email", "email": email, "token": code},
        )
        return self._session_or_code_error(response, "verify")

    async def resend_verification(self, *, email: str) -> None:
        """Best effort, and silent about whether the account exists."""
        response = await self._post(
            "/resend",
            headers=self._public_headers(),
            json={"type": "signup", "email": email},
        )
        if response.status_code == 429:
            raise UpstreamRateLimitError(MSG_TOO_MANY_EMAILS)
        if response.status_code >= 500:
            logger.error("supabase resend failed: status=%s", response.status_code)
            raise UpstreamAuthError(MSG_EMAIL_SEND_FAILED)

    # -- sign-in -----------------------------------------------------------

    async def sign_in(self, *, email: str, password: str) -> SessionResponse:
        response = await self._post(
            "/token",
            headers=self._public_headers(),
            params={"grant_type": "password"},
            json={"email": email, "password": password},
        )

        if response.status_code == 200:
            return _to_session(response.json())

        if response.status_code in (400, 401, 403):
            if "email_not_confirmed" in _upstream_message(response):
                # Supabase only says this after the password checked out, so it
                # reveals nothing to someone without the password.
                try:
                    await self.resend_verification(email=email)
                except AuthError:
                    logger.warning("could not resend code after unverified login")
                raise EmailNotVerifiedError(MSG_EMAIL_NOT_VERIFIED)
            # Unknown account and wrong password return the same error, so the
            # endpoint cannot be used to discover which addresses are registered.
            raise InvalidCredentialsError("Incorrect email or password.")

        if response.status_code == 429:
            raise UpstreamRateLimitError(MSG_TOO_MANY_ATTEMPTS)

        logger.error("supabase login failed: status=%s", response.status_code)
        raise UpstreamAuthError(MSG_UNAVAILABLE)

    async def sign_in_with_google(self, *, id_token: str) -> SessionResponse:
        """Trade a Google ID token for a session, creating the account if new."""
        response = await self._post(
            "/token",
            headers=self._public_headers(),
            params={"grant_type": "id_token"},
            json={"provider": "google", "id_token": id_token},
        )

        if response.status_code == 200:
            return _to_session(response.json())

        if response.status_code == 429:
            raise UpstreamRateLimitError(MSG_TOO_MANY_ATTEMPTS)

        if response.status_code in (400, 401, 403, 422):
            # Upstream text here names config problems (provider disabled, wrong
            # audience) and never carries the token, so it is safe and useful to log.
            logger.warning("google sign-in rejected: %s", _upstream_message(response)[:200])
            if "database error" in _upstream_message(response):
                raise AccountExistsError(MSG_ACCOUNT_EXISTS)
            raise GoogleSignInError(MSG_GOOGLE_FAILED)

        logger.error("supabase google sign-in failed: status=%s", response.status_code)
        raise UpstreamAuthError(MSG_UNAVAILABLE)

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
            raise SessionExpiredError("Your session has ended. Please log in again.")

        logger.error("supabase refresh failed: status=%s", response.status_code)
        raise UpstreamAuthError(MSG_UNAVAILABLE)

    async def sign_out(self, *, access_token: str) -> None:
        """Revoke this device's refresh token upstream. Best effort by design.

        scope=local signs out only this device; the user stays signed in on
        their other phones.
        """
        headers = self._public_headers() | {"Authorization": f"Bearer {access_token}"}
        try:
            await self._send("POST", "/logout", headers=headers, json={}, params={"scope": "local"})
        except UpstreamAuthError:
            logger.warning("logout revocation failed upstream; client tokens discarded")

    # -- password recovery -------------------------------------------------

    async def request_password_reset(self, *, email: str) -> None:
        """Email a recovery code. Silent about whether the account exists."""
        response = await self._post(
            "/recover", headers=self._public_headers(), json={"email": email}
        )
        if response.status_code == 429:
            raise UpstreamRateLimitError(MSG_TOO_MANY_EMAILS)
        if response.status_code >= 500:
            logger.error("supabase recover failed: status=%s", response.status_code)
            raise UpstreamAuthError(MSG_EMAIL_SEND_FAILED)

    async def reset_password(self, *, email: str, code: str, new_password: str) -> SessionResponse:
        """Verify the recovery code, set the new password, and return the session.

        A recovery code proves the inbox, so this also verifies an unverified email.
        """
        response = await self._post(
            "/verify",
            headers=self._public_headers(),
            json={"type": "recovery", "email": email, "token": code},
        )
        session = self._session_or_code_error(response, "recovery")

        update = await self._send(
            "PUT",
            "/user",
            headers=self._public_headers() | {"Authorization": f"Bearer {session.access_token}"},
            json={"password": new_password},
        )
        if update.status_code == 200:
            return session
        if "same_password" in _upstream_message(update):
            raise WeakPasswordError(MSG_SAME_PASSWORD)
        if _mentions_weak_password(update):
            raise WeakPasswordError(MSG_BREACHED_PASSWORD)
        logger.error("supabase password update failed: status=%s", update.status_code)
        raise UpstreamAuthError("We couldn't update your password right now. Please try again.")

    # -- admin -------------------------------------------------------------

    async def get_user(self, user_id: str) -> dict[str, Any] | None:
        response = await self._send(
            "GET", f"/admin/users/{user_id}", headers=self._admin_headers()
        )
        if response.status_code == 404:
            return None
        if response.status_code != 200:
            logger.error("supabase admin get user failed: status=%s", response.status_code)
            raise UpstreamAuthError(MSG_UNAVAILABLE)
        return _json(response)

    async def delete_user(self, user_id: str) -> None:
        response = await self._send(
            "DELETE", f"/admin/users/{user_id}", headers=self._admin_headers()
        )
        if response.status_code not in (200, 204, 404):
            logger.error("supabase admin delete failed: status=%s", response.status_code)
            raise UpstreamAuthError(MSG_UNAVAILABLE)

    async def set_phone_metadata(self, user_id: str, phone_e164: str) -> None:
        """Merge the phone into user_metadata so new tokens carry it."""
        response = await self._send(
            "PUT",
            f"/admin/users/{user_id}",
            headers=self._admin_headers(),
            json={"user_metadata": {"phone": phone_e164}},
        )
        if response.status_code != 200:
            logger.error("supabase admin update failed: status=%s", response.status_code)
            raise UpstreamAuthError(MSG_UNAVAILABLE)

    # -- helpers -----------------------------------------------------------

    def _session_or_code_error(self, response: httpx.Response, flow: str) -> SessionResponse:
        if response.status_code == 200:
            return _to_session(response.json())
        if response.status_code == 429:
            raise UpstreamRateLimitError(MSG_TOO_MANY_ATTEMPTS)
        if response.status_code in (400, 401, 403, 422):
            raise InvalidCodeError(MSG_INVALID_CODE)
        logger.error("supabase %s failed: status=%s", flow, response.status_code)
        raise UpstreamAuthError(MSG_UNAVAILABLE)


def _json(response: httpx.Response) -> dict[str, Any]:
    try:
        body = response.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


def _upstream_message(response: httpx.Response) -> str:
    """Lowercased upstream error text. Never returned to a client as-is."""
    body = _json(response)
    return " ".join(
        str(body.get(key, ""))
        for key in ("msg", "message", "error_description", "error", "error_code", "code")
    ).lower()


def _mentions_existing_user(response: httpx.Response) -> bool:
    message = _upstream_message(response)
    return "already" in message and ("registered" in message or "exists" in message)


def _mentions_weak_password(response: httpx.Response) -> bool:
    message = _upstream_message(response)
    return "weak_password" in message or ("password" in message and "weak" in message)


def user_from_claims(payload: dict[str, Any]) -> UserResponse:
    """One mapping for both token payloads and Supabase user objects.

    Email signups keep the address in user_metadata.contact_email; Google users
    only have the top-level email and put their name in `name` or `full_name`.
    """
    metadata = payload.get("user_metadata") or {}
    app_metadata = payload.get("app_metadata") or {}
    return UserResponse(
        id=str(payload.get("id") or payload.get("sub") or ""),
        full_name=str(metadata.get("full_name") or metadata.get("name") or ""),
        phone=str(metadata.get("phone") or ""),
        contact_email=metadata.get("contact_email") or payload.get("email"),
        phone_verified=bool(app_metadata.get("phone_verified", False)),
    )


def _to_session(payload: dict[str, Any]) -> SessionResponse:
    return SessionResponse(
        access_token=payload["access_token"],
        refresh_token=payload["refresh_token"],
        expires_in=int(payload.get("expires_in", 3600)),
        user=user_from_claims(payload.get("user") or {}),
    )
