"""Profile lookups the auth flows need: who owns a phone number, and saving one.

Reads and writes public.users through PostgREST with the secret key, which
bypasses RLS - every query here is filtered explicitly.
"""

import logging
import uuid

import httpx

from app.core.config import Settings
from app.features.auth.service import (
    MSG_PHONE_TAKEN,
    MSG_UNAVAILABLE,
    PhoneAlreadySetError,
    PhoneTakenError,
    UpstreamAuthError,
)

logger = logging.getLogger(__name__)


class ProfileStore:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._base = f"{settings.supabase_url}/rest/v1/users"
        self._headers = {
            "apikey": settings.supabase_secret_key,
            "Authorization": f"Bearer {settings.supabase_secret_key}",
            "Content-Type": "application/json",
        }
        self._client = client

    async def phone_owner(self, phone_e164: str) -> str | None:
        """The user id holding this number, or None."""
        response = await self._request(
            "GET", params={"phone": f"eq.{phone_e164}", "select": "id", "limit": "1"}
        )
        rows = response.json()
        return str(rows[0]["id"]) if rows else None

    async def set_phone(self, user_id: str, phone_e164: str) -> None:
        """Save the number on a profile that has none yet.

        The unique index on public.users.phone is the real guard; a 409 from it
        means someone else holds the number.
        """
        uid = str(uuid.UUID(user_id))
        response = await self._request(
            "PATCH",
            params={"id": f"eq.{uid}", "phone": "is.null"},
            json={"phone": phone_e164},
            prefer="return=representation",
            conflict_ok=True,
        )
        if response.status_code == 409:
            raise PhoneTakenError(MSG_PHONE_TAKEN)
        if not response.json():
            raise PhoneAlreadySetError("A mobile number is already saved on this account.")

    async def _request(
        self,
        method: str,
        *,
        params: dict[str, str],
        json: dict | None = None,
        prefer: str | None = None,
        conflict_ok: bool = False,
    ) -> httpx.Response:
        headers = self._headers | ({"Prefer": prefer} if prefer else {})
        try:
            response = await self._client.request(
                method, self._base, headers=headers, params=params, json=json
            )
        except httpx.HTTPError as exc:
            logger.error("profile request failed: %s", type(exc).__name__)
            raise UpstreamAuthError(MSG_UNAVAILABLE) from exc
        if conflict_ok and response.status_code == 409:
            return response
        if response.status_code >= 400:
            logger.error("profile request failed: status=%s", response.status_code)
            raise UpstreamAuthError(MSG_UNAVAILABLE)
        return response
