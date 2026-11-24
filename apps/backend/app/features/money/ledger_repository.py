"""Persistence for the account ledger, over Supabase PostgREST.

Extends MoneyRepository (its client and helpers): every query filters by a
user id already parsed as a UUID, and bodies are never logged. This is the one
repository the money and ledger routers share.
"""

from datetime import UTC, date, datetime

from app.features.money.ledger import Account, Txn
from app.features.money.ledger_schemas import AccountCreate, AccountUpdate
from app.features.money.schemas import KhataCreate, KhataEntry, SpendCreate
from app.features.money.repository import (
    _REP,
    MoneyConflictError,
    MoneyRepository,
    MoneyStoreError,
    _uid,
)


def to_ledger_account(row: dict) -> Account:
    return Account(id=row["id"], kind=row["kind"])


def to_ledger_txn(row: dict) -> Txn:
    return Txn(
        id=row["id"],
        type=row["type"],
        amount_paise=int(row["amount_paise"]),
        occurred_on=date.fromisoformat(row["occurred_on"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        account_id=row.get("account_id"),
        to_account_id=row.get("to_account_id"),
        khata_entry_id=row.get("khata_entry_id"),
        category=row.get("category"),
    )


class LedgerRepository(MoneyRepository):
    # Accounts ----------------------------------------------------------------

    async def list_accounts(self, user_id: str) -> list[dict]:
        return await self._list("accounts", user_id, "created_at.asc")

    async def get_account(self, user_id: str, account_id: str) -> dict | None:
        rows = await self._request(
            "GET",
            "accounts",
            params={"id": f"eq.{_uid(account_id)}", "user_id": f"eq.{_uid(user_id)}", "select": "*"},
        )
        return rows[0] if rows else None

    async def create_account(self, user_id: str, data: AccountCreate, opening_paise: int) -> dict:
        """Account plus opening balance, atomically. Raises MoneyConflictError on a duplicate name."""
        row = await self._request(
            "POST",
            "rpc/create_account",
            json={
                "p_user": _uid(user_id),
                "p_client_key": str(data.client_key),
                "p_name": data.name,
                "p_kind": data.kind,
                "p_bank": data.bank,
                "p_icon": data.icon,
                "p_opening": opening_paise,
                "p_balance_on": data.balance_on.isoformat(),
            },
        )
        if not row:
            raise MoneyStoreError("Money service returned no row.")
        return row[0] if isinstance(row, list) else row

    async def update_account(self, user_id: str, account_id: str, data: AccountUpdate) -> dict | None:
        rows = await self._request(
            "PATCH",
            "accounts",
            params={
                "id": f"eq.{_uid(account_id)}",
                "user_id": f"eq.{_uid(user_id)}",
                "archived_at": "is.null",
            },
            json=data.model_dump(mode="json"),
            prefer=_REP,
        )
        return rows[0] if rows else None

    async def archive_account(self, user_id: str, account_id: str) -> bool:
        rows = await self._request(
            "PATCH",
            "accounts",
            params={
                "id": f"eq.{_uid(account_id)}",
                "user_id": f"eq.{_uid(user_id)}",
                "archived_at": "is.null",
                "select": "id",
            },
            json={"archived_at": datetime.now(UTC).isoformat()},
            prefer=_REP,
        )
        return bool(rows)

    # Transactions --------------------------------------------------------------

    async def list_transactions(
        self,
        user_id: str,
        start: date | None = None,
        end: date | None = None,
        include_deleted: bool = False,
    ) -> list[dict]:
        """Newest first. Without dates, the whole ledger (every figure needs all of it)."""
        extra: dict[str, str] = {}
        if not include_deleted:
            extra["deleted_at"] = "is.null"
        if start and end:
            extra["and"] = f"(occurred_on.gte.{start.isoformat()},occurred_on.lte.{end.isoformat()})"
        return await self._list("transactions", user_id, "occurred_on.desc,created_at.desc", **extra)

    async def get_transaction(self, user_id: str, txn_id: str) -> dict | None:
        rows = await self._request(
            "GET",
            "transactions",
            params={"id": f"eq.{_uid(txn_id)}", "user_id": f"eq.{_uid(user_id)}", "select": "*"},
        )
        return rows[0] if rows else None

    async def get_by_client_key(self, user_id: str, client_key: str) -> dict | None:
        rows = await self._request(
            "GET",
            "transactions",
            params={
                "user_id": f"eq.{_uid(user_id)}",
                "client_key": f"eq.{_uid(client_key)}",
                "select": "*",
            },
        )
        return rows[0] if rows else None

    async def add_transaction(self, user_id: str, body: dict) -> tuple[dict, bool]:
        """(row, created). A repeat client key returns the row it already made."""
        try:
            return await self._insert("transactions", user_id, body), True
        except MoneyConflictError:
            existing = await self.get_by_client_key(user_id, body["client_key"])
            if existing is None:
                raise
            return existing, False

    async def update_transaction(self, user_id: str, txn_id: str, body: dict) -> dict | None:
        """Only live rows; None when missing, deleted or not the user's."""
        rows = await self._request(
            "PATCH",
            "transactions",
            params={
                "id": f"eq.{_uid(txn_id)}",
                "user_id": f"eq.{_uid(user_id)}",
                "deleted_at": "is.null",
            },
            json={**body, "updated_at": datetime.now(UTC).isoformat()},
            prefer=_REP,
        )
        return rows[0] if rows else None

    # Khata on the ledger (sql/011) ---------------------------------------------

    async def add_khata_entry(
        self,
        user_id: str,
        data: KhataCreate,
        client_key: str,
        account_id: str | None,
        on: date,
    ) -> KhataEntry:
        """The person record and its lend or borrow entry, atomically. Retry-safe by client key."""
        row = await self._rpc(
            "add_khata_entry",
            {
                "p_user": _uid(user_id),
                "p_client_key": _uid(client_key),
                "p_direction": data.direction,
                "p_person": data.person,
                "p_amount": data.amount_paise,
                "p_note": data.note,
                "p_account": _uid(account_id) if account_id else None,
                "p_on": on.isoformat(),
            },
        )
        if not row or row.get("id") is None:
            raise MoneyStoreError("Money service returned no row.")
        return KhataEntry(**row)

    async def settle_khata_entry(
        self, user_id: str, entry_id: str, account_id: str | None, on: date
    ) -> KhataEntry | None:
        """None when the entry is missing, not the user's or already settled."""
        row = await self._rpc(
            "settle_khata_entry",
            {
                "p_user": _uid(user_id),
                "p_entry": _uid(entry_id),
                "p_account": _uid(account_id) if account_id else None,
                "p_on": on.isoformat(),
            },
        )
        return KhataEntry(**row) if row and row.get("id") is not None else None

    # Subscription payments on the ledger (sql/011) ------------------------------

    async def log_subscription_txn(
        self, user_id: str, account_id: str | None, data: SpendCreate
    ) -> dict:
        row = await self._rpc(
            "log_subscription_txn",
            {
                "p_user": _uid(user_id),
                "p_account": _uid(account_id) if account_id else None,
                "p_description": data.description,
                "p_amount": data.amount_paise,
                "p_on": data.spent_on.isoformat(),
                "p_billing_day": data.billing_day,
            },
        )
        if not row or row.get("id") is None:
            raise MoneyStoreError("Money service returned no row.")
        return row

    async def answer_cycle(
        self, user_id: str, sub_id: str, month: date, active: bool, account_id: str | None = None
    ) -> bool:
        """False when the subscription is not the user's; a repeat answer is a no-op (True)."""
        result = await self._request(
            "POST",
            "rpc/answer_cycle_ledger",
            json={
                "p_user": _uid(user_id),
                "p_subscription": _uid(sub_id),
                "p_month": month.isoformat(),
                "p_active": active,
                "p_account": _uid(account_id) if account_id else None,
            },
        )
        return result is True

    async def list_cycle_months(self, user_id: str) -> dict[str, set[date]]:
        """Answered months per subscription; a month whose payment was deleted is open again."""
        rows = await self._request("POST", "rpc/answered_cycles", json={"p_user": _uid(user_id)})
        months: dict[str, set[date]] = {}
        for row in rows or []:
            months.setdefault(row["subscription_id"], set()).add(date.fromisoformat(row["month"]))
        return months

    async def _rpc(self, name: str, args: dict) -> dict | None:
        row = await self._request("POST", f"rpc/{name}", json=args)
        return row[0] if isinstance(row, list) and row else (row or None)

    # Soft delete ---------------------------------------------------------------

    async def set_deleted(self, user_id: str, txn_id: str, deleted: bool) -> dict | None:
        """Soft delete (deleted=True) or Undo (False). None when there was nothing to change."""
        rows = await self._request(
            "PATCH",
            "transactions",
            params={
                "id": f"eq.{_uid(txn_id)}",
                "user_id": f"eq.{_uid(user_id)}",
                "deleted_at": "is.null" if deleted else "not.is.null",
            },
            json={"deleted_at": datetime.now(UTC).isoformat() if deleted else None},
            prefer=_REP,
        )
        return rows[0] if rows else None
