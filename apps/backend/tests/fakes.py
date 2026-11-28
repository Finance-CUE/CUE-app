"""In-memory stand-ins for LedgerRepository, shared by the API tests.

They behave like the tables and SQL functions in sql/010 and sql/011: unique
client keys and active names, soft delete, Khata entries written with their
ledger rows, subscription payments as expenses.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

from app.features.money.repository import MoneyConflictError, MoneyStoreError
from app.features.money.schemas import KhataEntry, NudgeTemplate, Nudges, Subscription
from app.features.money.service import billing_date

_LAST = [datetime.now(UTC)]


def now() -> str:
    """Strictly increasing timestamps, so ordering by created_at is stable."""
    _LAST[0] = max(datetime.now(UTC), _LAST[0] + timedelta(microseconds=1))
    return _LAST[0].isoformat()


def key() -> str:
    return str(uuid.uuid4())


class FakeLedger:
    def __init__(self) -> None:
        self.accounts: list[dict] = []
        self.txns: list[dict] = []
        self.list_calls: list[tuple] = []
        self.items: list[dict] = []
        # (user, item, month) -> (status, transaction id)
        self.cycle_rows: dict[tuple[str, str, date], tuple[str, str | None]] = {}
        self.jars: list[dict] = []
        self.jar_moves: list[dict] = []
        self.groups: list[dict] = []
        self.members: list[dict] = []
        self.gexpenses: list[dict] = []
        self.gsettlements: list[dict] = []
        self.note_log: dict[tuple[str, str], dict] = {}
        self.merchants: dict[tuple[str, str, str], str] = {}

    # Accounts ----------------------------------------------------------------

    async def list_accounts(self, user_id):
        return [a for a in self.accounts if a["user_id"] == user_id]

    async def create_account(self, user_id, data, opening_paise):
        for t in self.txns:
            if t["user_id"] == user_id and t["client_key"] == str(data.client_key):
                return next(a for a in self.accounts if a["id"] == t["account_id"])
        if any(
            a["user_id"] == user_id and a["archived_at"] is None
            and a["name"].lower() == data.name.lower()
            for a in self.accounts
        ):  # fmt: skip
            raise MoneyConflictError("name")
        account = {
            "id": key(), "user_id": user_id, "name": data.name, "kind": data.kind,
            "bank": data.bank, "icon": data.icon, "archived_at": None, "created_at": now(),
        }  # fmt: skip
        self.accounts.append(account)
        await self.add_transaction(
            user_id,
            {
                "client_key": str(data.client_key), "type": "opening",
                "amount_paise": opening_paise, "account_id": account["id"],
                "description": "Opening balance", "occurred_on": data.balance_on.isoformat(),
            },
        )  # fmt: skip
        return account

    async def update_account(self, user_id, account_id, data):
        for a in self.accounts:
            if a["id"] == account_id and a["user_id"] == user_id and a["archived_at"] is None:
                a.update(data.model_dump(mode="json"))
                return a
        return None

    async def archive_account(self, user_id, account_id):
        for a in self.accounts:
            if a["id"] == account_id and a["user_id"] == user_id and a["archived_at"] is None:
                a["archived_at"] = now()
                return True
        return False

    # Transactions --------------------------------------------------------------

    async def list_transactions(self, user_id, start=None, end=None, include_deleted=False):
        if start is not None:
            self.list_calls.append((user_id, start, end))
        rows = [
            t for t in self.txns
            if t["user_id"] == user_id and (include_deleted or t["deleted_at"] is None)
            and (start is None or start.isoformat() <= t["occurred_on"] <= end.isoformat())
        ]  # fmt: skip
        return sorted(rows, key=lambda t: (t["occurred_on"], t["created_at"]), reverse=True)

    async def get_transaction(self, user_id, txn_id):
        return next((t for t in self.txns if t["id"] == txn_id and t["user_id"] == user_id), None)

    async def get_by_client_key(self, user_id, client_key):
        return next(
            (t for t in self.txns if t["user_id"] == user_id and t["client_key"] == client_key), None
        )

    async def add_transaction(self, user_id, body):
        existing = await self.get_by_client_key(user_id, body.get("client_key"))
        if existing:
            return existing, False
        stamp = now()
        row = {
            "id": key(), "user_id": user_id, "client_key": key(), "account_id": None,
            "to_account_id": None, "category": None, "description": None, "note": None,
            "reason": None, "khata_entry_id": None, "refund_of": None, "source": "app",
            "schedule_id": None,
            "deleted_at": None, "created_at": stamp, "updated_at": stamp, **body,
        }  # fmt: skip
        self.txns.append(row)
        return row, True

    async def update_transaction(self, user_id, txn_id, body):
        t = await self.get_transaction(user_id, txn_id)
        if t is None or t["deleted_at"]:
            return None
        t.update(body, updated_at=now())
        return t

    async def set_deleted(self, user_id, txn_id, deleted):
        t = await self.get_transaction(user_id, txn_id)
        if t is None or (t["deleted_at"] is None) != deleted:
            return None
        t["deleted_at"] = now() if deleted else None
        return t

    # Scheduled items (sql/012 pay_scheduled, skip_scheduled, schedule_answers) -----

    async def list_schedule(self, user_id):
        return [i for i in self.items if i["user_id"] == user_id]

    async def get_schedule(self, user_id, item_id):
        return next((i for i in self.items if i["id"] == item_id and i["user_id"] == user_id), None)

    def _name_taken(self, user_id, name, but=None):
        return any(
            i["user_id"] == user_id and i["active"] and i["id"] != but
            and i["name"].strip().lower() == name.strip().lower()
            for i in self.items
        )  # fmt: skip

    async def create_schedule(self, user_id, body):
        for i in self.items:
            if i["user_id"] == user_id and i.get("client_key") == body["client_key"]:
                return i, False
        if self._name_taken(user_id, body["name"]):
            raise MoneyConflictError("name")
        row = {"id": key(), "user_id": user_id, "active": True, "created_at": now(), **body}
        self.items.append(row)
        return row, True

    async def update_schedule(self, user_id, item_id, body):
        row = await self.get_schedule(user_id, item_id)
        if row is None or not row["active"]:
            return None
        if self._name_taken(user_id, body["name"], but=item_id):
            raise MoneyConflictError("name")
        row.update(body)
        return row

    async def cancel_schedule(self, user_id, item_id):
        row = await self.get_schedule(user_id, item_id)
        if row is None or not row["active"]:
            return False
        row["active"] = False
        return True

    async def schedule_answers(self, user_id):
        from app.features.money.schedule import Answer

        deleted = {t["id"] for t in self.txns if t["deleted_at"] is not None}
        return {
            (item_id, month): Answer(status=status, transaction_id=txn)
            for (uid, item_id, month), (status, txn) in self.cycle_rows.items()
            if uid == user_id and txn not in deleted
        }

    async def pay_scheduled(self, user_id, item_id, month, client_key, amount, account_id, on):
        existing = await self.get_by_client_key(user_id, client_key)
        if existing:
            return existing
        row = await self.get_schedule(user_id, item_id)
        if row is None or (item_id, month) in await self.schedule_answers(user_id):
            return None
        kind = row["kind"]
        txn, _ = await self.add_transaction(
            user_id,
            {
                "client_key": client_key, "type": "income" if kind == "income" else "expense",
                "amount_paise": amount, "account_id": account_id,
                "category": row.get("category") or ("other" if kind in ("income", "other")
                                                    else "subscriptions" if kind == "subscription"
                                                    else "bills"),
                "description": row["name"], "occurred_on": on.isoformat(), "schedule_id": item_id,
            },
        )  # fmt: skip
        self.cycle_rows[(user_id, item_id, month)] = ("paid", txn["id"])
        return txn

    async def skip_scheduled(self, user_id, item_id, month):
        if await self.get_schedule(user_id, item_id) is None:
            return False
        if (item_id, month) in await self.schedule_answers(user_id):
            return False
        self.cycle_rows[(user_id, item_id, month)] = ("skipped", None)
        return True

    async def unskip_scheduled(self, user_id, item_id, month):
        if self.cycle_rows.get((user_id, item_id, month), (None,))[0] != "skipped":
            return False
        del self.cycle_rows[(user_id, item_id, month)]
        return True

    # Goal Jars (sql/013) ------------------------------------------------------------

    async def list_jars(self, user_id):
        return [j for j in self.jars if j["user_id"] == user_id]

    async def create_jar(self, user_id, body):
        for j in self.jars:
            if j["user_id"] == user_id and j["client_key"] == body["client_key"]:
                return j, False
        row = {
            "id": key(), "user_id": user_id, "status": "active", "celebrated": False,
            "completed_at": None, "created_at": now(), "updated_at": now(), **body,
        }  # fmt: skip
        self.jars.append(row)
        return row, True

    async def update_jar(self, user_id, jar_id, body):
        for j in self.jars:
            if j["id"] == jar_id and j["user_id"] == user_id and j["status"] != "archived":
                j.update(body, updated_at=now())
                return j
        return None

    async def list_jar_moves(self, user_id, include_deleted=False):
        rows = [m for m in self.jar_moves if m["user_id"] == user_id and (include_deleted or m["deleted_at"] is None)]
        return sorted(rows, key=lambda m: (m["occurred_on"], m["created_at"]), reverse=True)

    async def add_jar_move(self, user_id, body):
        for m in self.jar_moves:
            if m["user_id"] == user_id and m["client_key"] == body["client_key"]:
                return m, False
        row = {"id": key(), "user_id": user_id, "deleted_at": None, "created_at": now(), **body}
        self.jar_moves.append(row)
        return row, True

    async def get_jar_move(self, user_id, move_id):
        return next((m for m in self.jar_moves if m["id"] == move_id and m["user_id"] == user_id), None)

    async def set_jar_move_deleted(self, user_id, move_id, deleted):
        m = await self.get_jar_move(user_id, move_id)
        if m is None or (m["deleted_at"] is None) != deleted:
            return None
        m["deleted_at"] = now() if deleted else None
        return m

    # Groups (sql/014 put_group_expense, put_group_settlement, set_group_entry_deleted) ---

    async def list_groups(self, user_id):
        return [g for g in self.groups if g["user_id"] == user_id]

    async def create_group(self, user_id, body, members):
        for g in self.groups:
            if g["user_id"] == user_id and g["client_key"] == body["client_key"]:
                return g, False
        g = {"id": key(), "user_id": user_id, "archived_at": None, "created_at": now(), **body}
        self.groups.append(g)
        await self.add_group_members(user_id, g["id"], members, with_me=True)
        return g, True

    async def update_group(self, user_id, group_id, body):
        for g in self.groups:
            if g["id"] == group_id and g["user_id"] == user_id and g["archived_at"] is None:
                g.update(body)
                return g
        return None

    async def list_group_members(self, user_id):
        return [m for m in self.members if m["user_id"] == user_id]

    async def add_group_members(self, user_id, group_id, names, with_me=False):
        rows = ([("You", True)] if with_me else []) + [(n, False) for n in names]
        for name, me in rows:
            if any(m["group_id"] == group_id and m["removed_at"] is None and m["name"].lower() == name.lower()
                   for m in self.members):  # fmt: skip
                raise MoneyConflictError("name")
            self.members.append({"id": key(), "user_id": user_id, "group_id": group_id, "name": name,
                                 "is_me": me, "removed_at": None, "created_at": now()})  # fmt: skip

    async def remove_group_member(self, user_id, member_id):
        for m in self.members:
            if m["id"] == member_id and m["user_id"] == user_id and not m["is_me"]:
                m["removed_at"] = now()

    async def list_group_expenses(self, user_id):
        rows = [e for e in self.gexpenses if e["user_id"] == user_id and e["deleted_at"] is None]
        return sorted(rows, key=lambda e: (e["occurred_on"], e["created_at"]), reverse=True)

    async def list_group_settlements(self, user_id):
        rows = [s for s in self.gsettlements if s["user_id"] == user_id and s["deleted_at"] is None]
        return sorted(rows, key=lambda s: (s["occurred_on"], s["created_at"]), reverse=True)

    def _ledger_rows(self, user_id, rows, group_id, link, link_id, on):
        for r in rows:
            self.txns.append({
                "id": key(), "user_id": user_id, "client_key": key(), "account_id": r.get("account_id"),
                "to_account_id": None, "category": r.get("category"), "description": r.get("description"),
                "note": None, "reason": None, "khata_entry_id": None, "refund_of": None, "source": "app",
                "schedule_id": None, "deleted_at": None, "created_at": now(), "updated_at": now(),
                "type": r["type"], "amount_paise": r["amount_paise"], "occurred_on": on,
                "group_id": group_id, link: link_id,
            })  # fmt: skip

    async def put_group_expense(self, user_id, expense, shares, txns):
        if expense.get("id") is None:
            for e in self.gexpenses:
                if e["user_id"] == user_id and e["client_key"] == expense["client_key"]:
                    return e
            row = {"id": key(), "user_id": user_id, "deleted_at": None, "created_at": now(), **expense}
            self.gexpenses.append(row)
        else:
            row = next((e for e in self.gexpenses if e["id"] == expense["id"] and e["deleted_at"] is None), None)
            if row is None:
                return None
            row.update({k: v for k, v in expense.items() if k != "client_key"})
            self.txns = [t for t in self.txns if t.get("group_expense_id") != row["id"]]
        row["group_expense_shares"] = shares
        self._ledger_rows(user_id, txns, row["group_id"], "group_expense_id", row["id"], row["occurred_on"])
        return row

    async def put_group_settlement(self, user_id, settlement, txns):
        for s in self.gsettlements:
            if s["user_id"] == user_id and s["client_key"] == settlement["client_key"]:
                return s
        row = {"id": key(), "user_id": user_id, "deleted_at": None, "created_at": now(), **settlement}
        self.gsettlements.append(row)
        self._ledger_rows(user_id, txns, row["group_id"], "group_settlement_id", row["id"], row["occurred_on"])
        return row

    async def set_group_entry_deleted(self, user_id, kind, entry_id, deleted):
        table, link = (self.gexpenses, "group_expense_id") if kind == "expense" else (self.gsettlements, "group_settlement_id")
        row = next((r for r in table if r["id"] == entry_id and r["user_id"] == user_id), None)
        if row is None or (row["deleted_at"] is None) != deleted:
            return False
        stamp = now() if deleted else None
        row["deleted_at"] = stamp
        for t in self.txns:
            if t.get(link) == entry_id:
                t["deleted_at"] = stamp
        return True

    # Notes and category learning (sql/015) --------------------------------------------

    async def list_note_log(self, user_id):
        return [{"note_key": k, **v} for (u, k), v in self.note_log.items() if u == user_id]

    async def upsert_note_log(self, user_id, note_key, fields):
        self.note_log.setdefault((user_id, note_key), {"last_shown_on": None, "dismissed_on": None}).update(fields)

    async def list_merchant_categories(self, user_id):
        return [{"merchant": m, "kind": k, "category": c} for (u, m, k), c in sorted(self.merchants.items()) if u == user_id]

    async def upsert_merchant_category(self, user_id, merchant, kind, category):
        self.merchants[(user_id, merchant, kind)] = category

    # Test helpers ----------------------------------------------------------------

    def live(self, user_id, type_=None) -> list[dict]:
        return [
            t for t in self.txns
            if t["user_id"] == user_id and t["deleted_at"] is None
            and (type_ is None or t["type"] == type_)
        ]  # fmt: skip


class FakeMoney(FakeLedger):
    """The whole money repository: ledger plus Khata, subscriptions and nudges."""

    def __init__(self) -> None:
        super().__init__()
        self.khata: dict[str, list[KhataEntry]] = {}
        self.settled: dict[str, str] = {}
        self.due: dict[str, object] = {}
        self.subs: dict[str, list[Subscription]] = {}
        self.cycles: dict[str, dict[str, dict[date, str | None]]] = {}
        self.nudges: dict[str, Nudges] = {}
        self.template_calls: list[list[str]] = []
        self.templates_fail = False

    # Khata (sql/011 add_khata_entry, settle_khata_entry) ---------------------------

    async def list_open_khata(self, user_id):
        return [k for k in self.khata.get(user_id, []) if k.id not in self.settled]

    async def add_khata_entry(self, user_id, data, client_key, account_id, on):
        existing = await self.get_by_client_key(user_id, client_key)
        if existing:
            return next(k for k in self.khata[user_id] if k.id == existing["khata_entry_id"])
        entry = KhataEntry(
            id=key(), created_at=now(), direction=data.direction, person=data.person,
            amount_paise=data.amount_paise, note=data.note,
        )  # fmt: skip
        self.khata.setdefault(user_id, []).append(entry)
        await self.add_transaction(
            user_id,
            {
                "client_key": client_key,
                "type": "lend" if data.direction == "lent" else "borrow",
                "amount_paise": data.amount_paise, "account_id": account_id,
                "khata_entry_id": entry.id, "description": data.person,
                "occurred_on": on.isoformat(), "source": "app" if account_id else "legacy",
            },
        )  # fmt: skip
        return entry

    async def settle_khata_entry(self, user_id, entry_id, account_id, on):
        entry = next((k for k in await self.list_open_khata(user_id) if k.id == entry_id), None)
        if entry is None:
            return None
        self.settled[entry_id] = now()
        await self.add_transaction(
            user_id,
            {
                "client_key": key(),
                "type": "repayment_received" if entry.direction == "lent" else "repayment_made",
                "amount_paise": self._open(user_id, entry), "account_id": account_id,
                "khata_entry_id": entry.id, "description": entry.person,
                "occurred_on": on.isoformat(), "source": "app" if account_id else "legacy",
            },
        )  # fmt: skip
        return entry

    async def set_khata_due(self, user_id, entry_id, due_on):
        self.due[entry_id] = due_on

    def _open(self, user_id, entry):
        repaid = sum(t["amount_paise"] for t in self.live(user_id)
                     if t["khata_entry_id"] == entry.id and t["type"] in ("repayment_received", "repayment_made"))  # fmt: skip
        return entry.amount_paise - repaid

    async def settle_person(self, user_id, client_key, person, from_them, amount, account_id, on):
        if await self.get_by_client_key(user_id, client_key):
            return 0
        left, first = amount, True
        direction = "lent" if from_them else "borrowed"
        for e in sorted(await self.list_open_khata(user_id), key=lambda k: k.created_at):
            if left <= 0 or e.direction != direction or e.person.lower() != person.strip().lower():
                continue
            pay = min(left, self._open(user_id, e))
            await self.add_transaction(user_id, {
                "client_key": client_key if first else key(),
                "type": "repayment_received" if from_them else "repayment_made",
                "amount_paise": pay, "account_id": account_id, "khata_entry_id": e.id,
                "description": e.person, "occurred_on": on.isoformat(),
            })  # fmt: skip
            first = False
            if self._open(user_id, e) == 0:
                self.settled[e.id] = now()
            left -= pay
        if left > 0:
            from app.features.money.schemas import KhataCreate

            await self.add_khata_entry(
                user_id, KhataCreate(direction="borrowed" if from_them else "lent", person=person, amount_paise=left),
                client_key if first else key(), account_id, on,
            )  # fmt: skip
        return left

    async def delete_khata(self, user_id, entry_id):
        rows = self.khata.get(user_id, [])
        for row in rows:
            if row.id == entry_id:
                rows.remove(row)
                self.txns = [t for t in self.txns if t["khata_entry_id"] != entry_id]  # cascade
                return True
        return False

    # Subscriptions (sql/011 log_subscription_txn, answer_cycle_ledger, answered_cycles) --

    async def list_subscriptions(self, user_id):
        return list(self.subs.get(user_id, []))

    async def add_subscription(self, user_id, data):
        name = data.name.strip().lower()
        if any(s.active and s.name.lower() == name for s in self.subs.get(user_id, [])):
            raise MoneyConflictError("Subscription exists.")
        sub = Subscription(id=key(), created_at=now(), active=True, **data.model_dump())
        self.subs.setdefault(user_id, []).append(sub)
        return sub

    async def delete_subscription(self, user_id, sub_id):
        rows = self.subs.get(user_id, [])
        for row in rows:
            if row.id == sub_id:
                rows.remove(row)
                return True
        return False

    async def _expense(self, user_id, account_id, name, amount, on):
        row, _ = await self.add_transaction(
            user_id,
            {
                "client_key": key(), "type": "expense", "amount_paise": amount,
                "account_id": account_id, "category": "subscriptions",
                "description": name, "occurred_on": on.isoformat(),
            },
        )  # fmt: skip
        return row

    async def log_subscription_txn(self, user_id, account_id, data):
        row = await self._expense(user_id, account_id, data.description, data.amount_paise, data.spent_on)
        name = data.description.strip().lower()
        sub = next(
            (s for s in self.subs.get(user_id, []) if s.active and s.name.lower() == name), None
        )
        if sub is None:
            sub = Subscription(
                id=key(), created_at=now(), active=True, name=data.description,
                amount_paise=data.amount_paise, billing_day=data.billing_day,
                starts_on=data.spent_on,
            )  # fmt: skip
            self.subs.setdefault(user_id, []).append(sub)
        else:
            sub.amount_paise, sub.billing_day = data.amount_paise, data.billing_day
        self.cycles.setdefault(user_id, {}).setdefault(sub.id, {}).setdefault(
            data.spent_on.replace(day=1), row["id"]
        )
        return row

    async def answer_cycle(self, user_id, sub_id, month, active, account_id=None):
        sub = next((x for x in self.subs.get(user_id, []) if x.id == sub_id), None)
        if sub is None:
            return False
        if not sub.active or month < sub.starts_on.replace(day=1):
            return True
        months = self.cycles.setdefault(user_id, {}).setdefault(sub_id, {})
        if month in (await self.list_cycle_months(user_id)).get(sub_id, set()):
            return True
        if active:
            row = await self._expense(
                user_id, account_id, sub.name, sub.amount_paise, billing_date(month, sub.billing_day)
            )
            months[month] = row["id"]
        else:
            months[month] = None
            sub.active = False
        return True

    async def list_schedule(self, user_id):
        old = [
            {
                "id": s.id, "user_id": user_id, "name": s.name, "amount_paise": s.amount_paise,
                "billing_day": s.billing_day, "starts_on": s.starts_on.isoformat(), "active": s.active,
                "created_at": s.created_at.isoformat(), "kind": "subscription", "frequency": "monthly",
                "first_due_on": None, "reminder": True,
            }
            for s in self.subs.get(user_id, [])
        ]  # fmt: skip
        return old + await super().list_schedule(user_id)

    async def schedule_answers(self, user_id):
        from app.features.money.schedule import Answer

        answers = await super().schedule_answers(user_id)
        for sub_id, months in (await self.list_cycle_months(user_id)).items():
            for month in months:
                answers[(sub_id, month)] = Answer(status="paid", transaction_id=None)
        return answers

    async def list_cycle_months(self, user_id):
        deleted = {t["id"] for t in self.txns if t["deleted_at"] is not None}
        return {
            sub_id: {m for m, txn in months.items() if txn not in deleted}
            for sub_id, months in self.cycles.get(user_id, {}).items()
        }

    # Templates and nudge preferences ------------------------------------------------

    async def list_templates(self, archetypes):
        self.template_calls.append(archetypes)
        if self.templates_fail:
            raise MoneyStoreError("Money service unavailable.")
        return [
            NudgeTemplate(
                archetype="default", kind="pattern", title="{label} again",
                body="{count} times, {total} in all.",
            )  # fmt: skip
        ]

    async def get_nudges(self, user_id):
        return self.nudges.get(user_id, Nudges(pre_spend=True, patterns=True, weekly=True))

    async def put_nudges(self, user_id, data):
        self.nudges[user_id] = Nudges(**data.model_dump())
        return self.nudges[user_id]
