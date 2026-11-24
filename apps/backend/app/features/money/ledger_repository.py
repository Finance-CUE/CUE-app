"""Persistence for the account ledger, over Supabase PostgREST.

Reuses MoneyRepository's client and helpers: every query filters by a user id
already parsed as a UUID, and bodies are never logged.
"""

from datetime import UTC, date, datetime

from app.features.money.ledger import Account, Txn
from app.features.money.ledger_schemas import AccountCreate, AccountUpdate
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
