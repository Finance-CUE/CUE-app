"""Persistence for the money tabs, over Supabase PostgREST.

Same shape as the assessment repository: the secret key bypasses RLS, so every
query filters by a user id (and entity ids) already parsed as UUIDs.

Never log request or response bodies: they hold the user's money.
"""

import logging
import re
import uuid
from datetime import UTC, date, datetime
from typing import Any

import httpx

from app.core.config import Settings
from app.features.money.schemas import (
    BalanceSnapshot,
    KhataCreate,
    KhataEntry,
    NudgeTemplate,
    Nudges,
    NudgesPut,
    Spend,
    SpendCreate,
    StartingMoney,
    StartingMoneyPut,
    Subscription,
    SubscriptionCreate,
)

logger = logging.getLogger(__name__)

_REP = "return=representation"
_PAGE = 1000  # must not exceed the project's PostgREST "Max rows"


class MoneyStoreError(Exception):
    """The money store was unreachable or rejected a request."""


class MoneyConflictError(MoneyStoreError):
    """The store refused a write on a unique constraint (HTTP 409)."""


def _uid(value: str) -> str:
    # Raises ValueError for anything that is not a UUID, before any request is built.
    return str(uuid.UUID(value))


class MoneyRepository:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._client = client
        self._base = f"{settings.supabase_url}/rest/v1"
        self._key = settings.supabase_secret_key

    def _headers(self, prefer: str | None = None) -> dict[str, str]:
        headers = {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        return headers

    async def _request(
        self,
        method: str,
        table: str,
        *,
        params: dict[str, str] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> Any:
        try:
            response = await self._client.request(
                method,
                f"{self._base}/{table}",
                headers=self._headers(prefer),
                params=params,
                json=json,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            # Class of failure only; the body can echo the user's data.
            logger.error("money store %s %s failed: %s", method, table, type(exc).__name__)
            if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 409:
                raise MoneyConflictError("Conflict.") from exc
            raise MoneyStoreError("Money service unavailable.") from exc
        return response.json() if response.content else None

    async def _get_all(self, table: str, params: dict[str, str]) -> list[dict]:
        # PostgREST caps each response at "Max rows" (default 1000): page until a short page.
        # Callers' order must end in a unique key so pages neither skip nor repeat rows.
        rows: list[dict] = []
        while True:
            page = await self._request(
                "GET", table, params={**params, "limit": str(_PAGE), "offset": str(len(rows))}
            )
            rows.extend(page)
            if len(page) < _PAGE:
                return rows

    async def _list(self, table: str, user_id: str, order: str, **extra: str) -> list[dict]:
        return await self._get_all(
            table,
            {
                "user_id": f"eq.{_uid(user_id)}",
                "select": "*",
                "order": f"{order},id.asc",
                **extra,
            },
        )

    async def _insert(self, table: str, user_id: str, data: dict) -> dict:
        rows = await self._request(
            "POST", table, json={**data, "user_id": _uid(user_id)}, prefer=_REP
        )
        if not rows:
            raise MoneyStoreError("Money service returned no row.")
        return rows[0]

    async def _delete(self, table: str, user_id: str, entity_id: str) -> bool:
        rows = await self._request(
            "DELETE",
            table,
            params={
                "id": f"eq.{_uid(entity_id)}",
                "user_id": f"eq.{_uid(user_id)}",
                "select": "id",
            },
            prefer=_REP,
        )
        return bool(rows)

    # Spends ------------------------------------------------------------------

    async def add_spend(self, user_id: str, data: SpendCreate) -> Spend:
        # billing_day belongs to subscriptions, not the spends table.
        body = data.model_dump(mode="json", exclude={"billing_day"})
        return Spend(**await self._insert("spends", user_id, body))

    async def list_spends(self, user_id: str, start: date, end: date) -> list[Spend]:
        rows = await self._list(
            "spends",
            user_id,
            "spent_on.desc,created_at.desc",
            **{"and": f"(spent_on.gte.{start.isoformat()},spent_on.lte.{end.isoformat()})"},
        )
        return [Spend(**row) for row in rows]

    async def delete_spend(self, user_id: str, spend_id: str) -> bool:
        return await self._delete("spends", user_id, spend_id)

    async def add_subscription_spend(self, user_id: str, data: SpendCreate) -> Spend:
        row = await self._request(
            "POST",
            "rpc/log_subscription_spend",
            json={
                "p_user": _uid(user_id),
                "p_description": data.description,
                "p_amount": data.amount_paise,
                "p_spent_on": data.spent_on.isoformat(),
                "p_billing_day": data.billing_day,
            },
        )
        if not row:
            raise MoneyStoreError("Money service returned no row.")
        return Spend(**(row[0] if isinstance(row, list) else row))

    # Starting money ----------------------------------------------------------

    async def get_starting_money(self, user_id: str) -> StartingMoney | None:
        rows = await self._request(
            "GET",
            "starting_money",
            params={"user_id": f"eq.{_uid(user_id)}", "select": "bank_paise,cash_paise,set_at"},
        )
        return StartingMoney(**rows[0]) if rows else None

    async def put_starting_money(self, user_id: str, data: StartingMoneyPut) -> StartingMoney:
        uid = _uid(user_id)
        amounts = data.model_dump()
        if not await self.get_starting_money(uid):
            # First save: set_at comes from the column default (now). A concurrent
            # first save loses the insert race silently, then both just PATCH.
            await self._request(
                "POST",
                "starting_money",
                params={"on_conflict": "user_id"},
                json={**amounts, "user_id": uid},
                prefer="resolution=ignore-duplicates,return=minimal",
            )
        rows = await self._request(
            "PATCH", "starting_money", params={"user_id": f"eq.{uid}"}, json=amounts, prefer=_REP
        )
        if not rows:
            raise MoneyStoreError("Money service returned no row.")
        return StartingMoney(**rows[0])

    # Khata -------------------------------------------------------------------

    async def list_open_khata(self, user_id: str) -> list[KhataEntry]:
        rows = await self._list("khata_entries", user_id, "created_at.desc", settled_at="is.null")
        return [KhataEntry(**row) for row in rows]

    async def add_khata(self, user_id: str, data: KhataCreate) -> KhataEntry:
        return KhataEntry(**await self._insert("khata_entries", user_id, data.model_dump()))

    async def settle_khata(self, user_id: str, entry_id: str) -> bool:
        rows = await self._request(
            "PATCH",
            "khata_entries",
            params={
                "id": f"eq.{_uid(entry_id)}",
                "user_id": f"eq.{_uid(user_id)}",
                "settled_at": "is.null",
                "select": "id",
            },
            json={"settled_at": datetime.now(UTC).isoformat()},
            prefer=_REP,
        )
        return bool(rows)

    async def delete_khata(self, user_id: str, entry_id: str) -> bool:
        return await self._delete("khata_entries", user_id, entry_id)

    # Subscriptions -----------------------------------------------------------

    async def list_subscriptions(self, user_id: str) -> list[Subscription]:
        rows = await self._list("subscriptions", user_id, "created_at.asc")
        return [Subscription(**row) for row in rows]

    async def add_subscription(self, user_id: str, data: SubscriptionCreate) -> Subscription:
        row = await self._insert("subscriptions", user_id, data.model_dump(mode="json"))
        return Subscription(**row)

    async def delete_subscription(self, user_id: str, sub_id: str) -> bool:
        return await self._delete("subscriptions", user_id, sub_id)

    async def answer_cycle(self, user_id: str, sub_id: str, month: date, active: bool) -> bool:
        """False when the subscription is not the user's; a repeat answer is a no-op (True)."""
        result = await self._request(
            "POST",
            "rpc/answer_subscription_cycle",
            json={
                "p_user": _uid(user_id),
                "p_subscription": _uid(sub_id),
                "p_month": month.isoformat(),
                "p_active": active,
            },
        )
        return result is True

    async def list_cycle_months(self, user_id: str) -> dict[str, set[date]]:
        rows = await self._get_all(
            "subscription_cycles",
            {
                "user_id": f"eq.{_uid(user_id)}",
                "select": "subscription_id,month",
                "order": "id.asc",
            },
        )
        months: dict[str, set[date]] = {}
        for row in rows:
            months.setdefault(row["subscription_id"], set()).add(date.fromisoformat(row["month"]))
        return months

    # Balance history and notification templates -------------------------------

    async def list_balance_history(self, user_id: str) -> list[BalanceSnapshot]:
        rows = await self._list("balance_history", user_id, "recorded_at.asc")
        return [BalanceSnapshot(**row) for row in rows]

    async def list_templates(self, archetypes: list[str]) -> list[NudgeTemplate]:
        # Slugs go into a PostgREST filter; refuse anything that could alter it.
        if not all(re.fullmatch(r"[a-z0-9_-]+", a) for a in archetypes):
            raise ValueError("bad archetype")
        rows = await self._get_all(
            "notification_templates",
            {
                "archetype": f"in.({','.join(archetypes)})",
                "active": "eq.true",
                "select": "archetype,kind,title,body",
                "order": "id.asc",
            },
        )
        return [NudgeTemplate(**row) for row in rows]

    # Nudge preferences (columns on users) ------------------------------------

    async def get_nudges(self, user_id: str) -> Nudges:
        rows = await self._request(
            "GET",
            "users",
            params={
                "id": f"eq.{_uid(user_id)}",
                "select": "nudge_pre_spend,nudge_patterns,nudge_weekly",
            },
        )
        return self._nudges(rows[0]) if rows else Nudges(pre_spend=True, patterns=True, weekly=True)

    async def put_nudges(self, user_id: str, data: NudgesPut) -> Nudges:
        rows = await self._request(
            "PATCH",
            "users",
            params={"id": f"eq.{_uid(user_id)}"},
            json={
                "nudge_pre_spend": data.pre_spend,
                "nudge_patterns": data.patterns,
                "nudge_weekly": data.weekly,
            },
            prefer=_REP,
        )
        if not rows:
            raise MoneyStoreError("Money service returned no row.")
        return self._nudges(rows[0])

    @staticmethod
    def _nudges(row: dict) -> Nudges:
        return Nudges(
            pre_spend=row["nudge_pre_spend"],
            patterns=row["nudge_patterns"],
            weekly=row["nudge_weekly"],
        )
