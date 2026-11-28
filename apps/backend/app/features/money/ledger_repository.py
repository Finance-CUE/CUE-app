"""Persistence for the account ledger, over Supabase PostgREST.

Extends MoneyRepository (its client and helpers): every query filters by a
user id already parsed as a UUID, and bodies are never logged. This is the one
repository the money and ledger routers share.
"""

from datetime import UTC, date, datetime

from app.features.money.ledger import Account, Txn
from app.features.money.jars import Jar
from app.features.money.jars import Move as JarMove
from app.features.money.schedule import Answer, Item
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
        group_id=row.get("group_id"),
    )


def to_schedule_item(row: dict) -> Item:
    first_due = row.get("first_due_on")
    return Item(
        id=row["id"],
        name=row["name"],
        kind=row.get("kind") or "subscription",
        frequency=row.get("frequency") or "monthly",
        amount_paise=int(row["amount_paise"]),
        billing_day=int(row["billing_day"]),
        starts_on=date.fromisoformat(row["starts_on"]),
        first_due_on=date.fromisoformat(first_due) if first_due else None,
        active=bool(row["active"]),
        account_id=row.get("account_id"),
        category=row.get("category"),
        variable=bool(row.get("variable", False)),
        reminder=bool(row.get("reminder", True)),
    )


def to_jar(row: dict) -> Jar:
    nxt = row.get("next_contribution_on")
    target = row.get("target_date")
    return Jar(
        id=row["id"],
        name=row["name"],
        target_paise=int(row["target_paise"]),
        target_date=date.fromisoformat(target) if target else None,
        account_id=row["account_id"],
        method=row.get("method") or "manual",
        contribution_paise=int(row["contribution_paise"]) if row.get("contribution_paise") else None,
        next_contribution_on=date.fromisoformat(nxt) if nxt else None,
        status=row.get("status") or "active",
        created_on=datetime.fromisoformat(row["created_at"]).date(),
    )


def to_jar_move(row: dict) -> JarMove:
    return JarMove(
        id=row["id"],
        jar_id=row["jar_id"],
        amount_paise=int(row["amount_paise"]),
        account_id=row["account_id"],
        occurred_on=date.fromisoformat(row["occurred_on"]),
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

    async def set_khata_due(self, user_id: str, entry_id: str, due_on: date) -> None:
        await self._request(
            "PATCH",
            "khata_entries",
            params={"id": f"eq.{_uid(entry_id)}", "user_id": f"eq.{_uid(user_id)}"},
            json={"due_on": due_on.isoformat()},
        )

    async def settle_person(
        self, user_id: str, client_key: str, person: str, from_them: bool, amount: int, account_id: str, on: date
    ) -> int:
        """Part payment with a person (sql/014). Returns what went beyond the open balance."""
        result = await self._request(
            "POST",
            "rpc/settle_person",
            json={
                "p_user": _uid(user_id),
                "p_client_key": _uid(client_key),
                "p_person": person,
                "p_from_them": from_them,
                "p_amount": amount,
                "p_account": _uid(account_id),
                "p_on": on.isoformat(),
            },
        )
        return int(result or 0)

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

    # Scheduled items (sql/012) -------------------------------------------------

    async def list_schedule(self, user_id: str) -> list[dict]:
        """Every scheduled item, cancelled ones included (their answers stay in the calendar)."""
        return await self._list("subscriptions", user_id, "created_at.asc")

    async def get_schedule(self, user_id: str, item_id: str) -> dict | None:
        rows = await self._request(
            "GET",
            "subscriptions",
            params={"id": f"eq.{_uid(item_id)}", "user_id": f"eq.{_uid(user_id)}", "select": "*"},
        )
        return rows[0] if rows else None

    async def create_schedule(self, user_id: str, body: dict) -> tuple[dict, bool]:
        """(row, created). A repeat client key returns the item it already made;
        MoneyConflictError when an active item already has the name."""
        try:
            return await self._insert("subscriptions", user_id, body), True
        except MoneyConflictError:
            rows = await self._request(
                "GET",
                "subscriptions",
                params={
                    "user_id": f"eq.{_uid(user_id)}",
                    "client_key": f"eq.{_uid(body['client_key'])}",
                    "select": "*",
                },
            )
            if not rows:
                raise
            return rows[0], False

    async def update_schedule(self, user_id: str, item_id: str, body: dict) -> dict | None:
        """Active items only. MoneyConflictError when another active item has the name."""
        rows = await self._request(
            "PATCH",
            "subscriptions",
            params={"id": f"eq.{_uid(item_id)}", "user_id": f"eq.{_uid(user_id)}", "active": "is.true"},
            json=body,
            prefer=_REP,
        )
        return rows[0] if rows else None

    async def cancel_schedule(self, user_id: str, item_id: str) -> bool:
        rows = await self._request(
            "PATCH",
            "subscriptions",
            params={
                "id": f"eq.{_uid(item_id)}",
                "user_id": f"eq.{_uid(user_id)}",
                "active": "is.true",
                "select": "id",
            },
            json={"active": False},
            prefer=_REP,
        )
        return bool(rows)

    async def schedule_answers(self, user_id: str) -> dict[tuple[str, date], Answer]:
        """Answers per (item, month); a paid month whose entry was deleted is open again."""
        rows = await self._request("POST", "rpc/schedule_answers", json={"p_user": _uid(user_id)})
        return {
            (r["subscription_id"], date.fromisoformat(r["month"])): Answer(
                status="paid" if r["status"] == "logged" else "skipped",
                transaction_id=r.get("transaction_id"),
            )
            for r in rows or []
        }

    async def pay_scheduled(
        self, user_id: str, item_id: str, month: date, client_key: str, amount: int, account_id: str, on: date
    ) -> dict | None:
        """The entry made (or made already, on a retry); None when the month was answered."""
        row = await self._rpc(
            "pay_scheduled",
            {
                "p_user": _uid(user_id),
                "p_schedule": _uid(item_id),
                "p_month": month.isoformat(),
                "p_client_key": _uid(client_key),
                "p_amount": amount,
                "p_account": _uid(account_id),
                "p_on": on.isoformat(),
            },
        )
        return row if row and row.get("id") is not None else None

    async def skip_scheduled(self, user_id: str, item_id: str, month: date) -> bool:
        result = await self._request(
            "POST",
            "rpc/skip_scheduled",
            json={"p_user": _uid(user_id), "p_schedule": _uid(item_id), "p_month": month.isoformat()},
        )
        return result is True

    async def unskip_scheduled(self, user_id: str, item_id: str, month: date) -> bool:
        """Undo a Skip: the month is due again."""
        rows = await self._request(
            "DELETE",
            "subscription_cycles",
            params={
                "user_id": f"eq.{_uid(user_id)}",
                "subscription_id": f"eq.{_uid(item_id)}",
                "month": f"eq.{month.isoformat()}",
                "status": "eq.skipped",
                "select": "id",
            },
            prefer=_REP,
        )
        return bool(rows)

    # Goal Jars (sql/013) ------------------------------------------------------------

    async def list_jars(self, user_id: str) -> list[dict]:
        """Every jar, archived ones included (their history stays)."""
        return await self._list("goal_jars", user_id, "created_at.asc")

    async def create_jar(self, user_id: str, body: dict) -> tuple[dict, bool]:
        """(row, created). A repeat client key returns the jar it already made."""
        try:
            return await self._insert("goal_jars", user_id, body), True
        except MoneyConflictError:
            rows = await self._request(
                "GET",
                "goal_jars",
                params={
                    "user_id": f"eq.{_uid(user_id)}",
                    "client_key": f"eq.{_uid(body['client_key'])}",
                    "select": "*",
                },
            )
            if not rows:
                raise
            return rows[0], False

    async def update_jar(self, user_id: str, jar_id: str, body: dict) -> dict | None:
        """Any jar not archived; None when missing, archived or not the user's."""
        rows = await self._request(
            "PATCH",
            "goal_jars",
            params={"id": f"eq.{_uid(jar_id)}", "user_id": f"eq.{_uid(user_id)}", "status": "neq.archived"},
            json={**body, "updated_at": datetime.now(UTC).isoformat()},
            prefer=_REP,
        )
        return rows[0] if rows else None

    async def list_jar_moves(self, user_id: str, include_deleted: bool = False) -> list[dict]:
        extra = {} if include_deleted else {"deleted_at": "is.null"}
        return await self._list("jar_moves", user_id, "occurred_on.desc,created_at.desc", **extra)

    async def add_jar_move(self, user_id: str, body: dict) -> tuple[dict, bool]:
        """(row, created). A repeat client key returns the move it already made."""
        try:
            return await self._insert("jar_moves", user_id, body), True
        except MoneyConflictError:
            rows = await self._request(
                "GET",
                "jar_moves",
                params={
                    "user_id": f"eq.{_uid(user_id)}",
                    "client_key": f"eq.{_uid(body['client_key'])}",
                    "select": "*",
                },
            )
            if not rows:
                raise
            return rows[0], False

    async def get_jar_move(self, user_id: str, move_id: str) -> dict | None:
        rows = await self._request(
            "GET",
            "jar_moves",
            params={"id": f"eq.{_uid(move_id)}", "user_id": f"eq.{_uid(user_id)}", "select": "*"},
        )
        return rows[0] if rows else None

    async def set_jar_move_deleted(self, user_id: str, move_id: str, deleted: bool) -> dict | None:
        """Undo an add or withdrawal (deleted=True), or bring it back. None when nothing changed."""
        rows = await self._request(
            "PATCH",
            "jar_moves",
            params={
                "id": f"eq.{_uid(move_id)}",
                "user_id": f"eq.{_uid(user_id)}",
                "deleted_at": "is.null" if deleted else "not.is.null",
            },
            json={"deleted_at": datetime.now(UTC).isoformat() if deleted else None},
            prefer=_REP,
        )
        return rows[0] if rows else None

    # Groups (sql/014) ------------------------------------------------------------------

    async def list_groups(self, user_id: str) -> list[dict]:
        return await self._list("groups", user_id, "created_at.asc")

    async def create_group(self, user_id: str, body: dict, members: list[str]) -> tuple[dict, bool]:
        """(row, created). The group, then "You" and its members. A retry with the same
        client key returns the group it made."""
        try:
            group = await self._insert("groups", user_id, body)
        except MoneyConflictError:
            rows = await self._request(
                "GET",
                "groups",
                params={"user_id": f"eq.{_uid(user_id)}", "client_key": f"eq.{_uid(body['client_key'])}", "select": "*"},
            )
            if not rows:
                raise
            return rows[0], False
        await self.add_group_members(user_id, group["id"], members, with_me=True)
        return group, True

    async def update_group(self, user_id: str, group_id: str, body: dict) -> dict | None:
        rows = await self._request(
            "PATCH",
            "groups",
            params={"id": f"eq.{_uid(group_id)}", "user_id": f"eq.{_uid(user_id)}", "archived_at": "is.null"},
            json=body,
            prefer=_REP,
        )
        return rows[0] if rows else None

    async def list_group_members(self, user_id: str) -> list[dict]:
        return await self._list("group_members", user_id, "created_at.asc")

    async def add_group_members(self, user_id: str, group_id: str, names: list[str], with_me: bool = False) -> None:
        rows = ([{"name": "You", "is_me": True}] if with_me else []) + [{"name": n, "is_me": False} for n in names]
        if not rows:
            return
        await self._request(
            "POST",
            "group_members",
            json=[{**r, "group_id": _uid(group_id), "user_id": _uid(user_id)} for r in rows],
            prefer=_REP,
        )

    async def remove_group_member(self, user_id: str, member_id: str) -> None:
        await self._request(
            "PATCH",
            "group_members",
            params={"id": f"eq.{_uid(member_id)}", "user_id": f"eq.{_uid(user_id)}", "is_me": "is.false"},
            json={"removed_at": datetime.now(UTC).isoformat()},
        )

    async def list_group_expenses(self, user_id: str) -> list[dict]:
        """Live expenses with their shares, newest first."""
        return await self._get_all(
            "group_expenses",
            {
                "user_id": f"eq.{_uid(user_id)}",
                "deleted_at": "is.null",
                "select": "*,group_expense_shares(member_id,share_paise)",
                "order": "occurred_on.desc,created_at.desc,id.asc",
            },
        )

    async def list_group_settlements(self, user_id: str) -> list[dict]:
        return await self._list("group_settlements", user_id, "occurred_on.desc,created_at.desc", deleted_at="is.null")

    async def put_group_expense(self, user_id: str, expense: dict, shares: list[dict], txns: list[dict]) -> dict | None:
        """Create or replace an expense with its shares and ledger rows, atomically."""
        row = await self._rpc(
            "put_group_expense",
            {"p_user": _uid(user_id), "p_expense": expense, "p_shares": shares, "p_txns": txns},
        )
        return row if row and row.get("id") is not None else None

    async def put_group_settlement(self, user_id: str, settlement: dict, txns: list[dict]) -> dict:
        row = await self._rpc(
            "put_group_settlement", {"p_user": _uid(user_id), "p_settlement": settlement, "p_txns": txns}
        )
        if not row or row.get("id") is None:
            raise MoneyStoreError("Money service returned no row.")
        return row

    async def set_group_entry_deleted(self, user_id: str, kind: str, entry_id: str, deleted: bool) -> bool:
        """Delete or Undo an expense or settlement with its ledger rows."""
        result = await self._request(
            "POST",
            "rpc/set_group_entry_deleted",
            json={"p_user": _uid(user_id), "p_kind": kind, "p_id": _uid(entry_id), "p_deleted": deleted},
        )
        return result is True

    # Notes and category learning (sql/015) --------------------------------------------

    async def list_note_log(self, user_id: str) -> list[dict]:
        return await self._get_all(
            "note_log", {"user_id": f"eq.{_uid(user_id)}", "select": "*", "order": "note_key.asc"}
        )

    async def upsert_note_log(self, user_id: str, note_key: str, fields: dict) -> None:
        await self._request(
            "POST",
            "note_log",
            params={"on_conflict": "user_id,note_key"},
            json={"user_id": _uid(user_id), "note_key": note_key, **fields},
            prefer="resolution=merge-duplicates",
        )

    async def list_merchant_categories(self, user_id: str) -> list[dict]:
        return await self._get_all(
            "merchant_categories",
            {"user_id": f"eq.{_uid(user_id)}", "select": "*", "order": "merchant.asc,kind.asc"},
        )

    async def upsert_merchant_category(self, user_id: str, merchant: str, kind: str, category: str) -> None:
        await self._request(
            "POST",
            "merchant_categories",
            params={"on_conflict": "user_id,merchant,kind"},
            json={
                "user_id": _uid(user_id),
                "merchant": merchant,
                "kind": kind,
                "category": category,
                "updated_at": datetime.now(UTC).isoformat(),
            },
            prefer="resolution=merge-duplicates",
        )

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
