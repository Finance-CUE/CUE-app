"""The old money endpoints' shapes, served from the ledger. Pure: no I/O.

The current app (1.1.x) knows spends, a bank + cash balance and Khata. From the
ledger release on, those endpoints read and write the ledger, so the old app
and the new dashboard always show the same numbers.
"""

from collections.abc import Iterable
from datetime import date, datetime
from typing import Literal

from app.features.money import ledger
from app.features.money.schemas import MoneySummary, Spend, StartingMoney, TrendPoint

# The old app's seven categories (plus subscription) against the spec's twelve.
OLD_TO_NEW: dict[str, str] = {
    "food": "food_delivery",
    "groceries": "groceries",
    "transport": "transport",
    "shopping": "shopping",
    "bills": "bills",
    "fun": "entertainment",
    "other": "other",
    "subscription": "subscriptions",
}
NEW_TO_OLD: dict[str, str] = {new: old for old, new in OLD_TO_NEW.items()}  # the rest show as "other"

BANK_KINDS: frozenset[str] = frozenset({"savings", "current"})


def old_category(category: str | None) -> str:
    return NEW_TO_OLD.get(category or "", "other")


def to_spend(row: dict) -> Spend:
    """An expense row in the old Spend shape."""
    return Spend(
        id=row["id"],
        description=row.get("description") or "Expense",
        amount_paise=int(row["amount_paise"]),
        category=old_category(row.get("category")),
        spent_on=row["occurred_on"],
        created_at=row["created_at"],
    )


def spends_of(rows: Iterable[dict]) -> list[Spend]:
    return [to_spend(r) for r in rows if r["type"] == "expense"]


def _active(rows: Iterable[dict]) -> list[dict]:
    live = [r for r in rows if r.get("archived_at") is None]
    return sorted(live, key=lambda r: (r["created_at"], r["id"]))


def pick_account(rows: Iterable[dict], prefer: Literal["bank", "cash"]) -> str | None:
    """Where an old-app entry lands: the first bank or cash account, as preferred.

    Spends and UPI repayments prefer bank; Khata entries prefer cash (the
    account chip's default). None when the user has no bank or cash account.
    """
    active = _active(rows)
    bank = [r for r in active if r["kind"] in BANK_KINDS]
    cash = [r for r in active if r["kind"] == "cash"]
    order = cash + bank if prefer == "cash" else bank + cash
    return order[0]["id"] if order else None


def split_balances(rows: Iterable[dict], balances: dict[str, int | None]) -> tuple[int, int]:
    """(bank, cash) as the old app shows them: savings + current, and cash."""
    bank = cash = 0
    for r in _active(rows):
        b = balances.get(r["id"])
        if b is None:
            continue
        if r["kind"] in BANK_KINDS:
            bank += b
        elif r["kind"] == "cash":
            cash += b
    return bank, cash


def build_summary(rows: list[dict], txns: list[ledger.Txn], today: date) -> MoneySummary:
    """GET /money/summary from the ledger.

    Bank and cash are today's balances, so nothing is "since the last update"
    any more: those two figures are always 0. Net worth now counts open Khata
    (lent is an asset, borrowed a liability).
    """
    accounts = [ledger.Account(id=r["id"], kind=r["kind"]) for r in rows]
    pos = ledger.position_on(accounts, txns, today)
    if not _active(rows):
        return MoneySummary(
            net_worth_paise=None,
            starting_money=None,
            owed_to_you_paise=pos.receivables_paise,
            you_owe_paise=pos.borrowings_paise,
        )
    balances = ledger.account_balances_on(accounts, txns, today)
    bank, cash = split_balances(rows, balances)
    stamps = [t.created_at for t in txns if t.type in ("opening", "adjustment")]
    set_at = max(stamps) if stamps else datetime.fromisoformat(_active(rows)[0]["created_at"])
    return MoneySummary(
        net_worth_paise=pos.net_worth_paise,
        starting_money=StartingMoney(bank_paise=bank, cash_paise=cash, set_at=set_at),
        spent_since_update_paise=0,
        received_since_update_paise=0,
        balance_paise=pos.available_paise,
        owed_to_you_paise=pos.receivables_paise,
        you_owe_paise=pos.borrowings_paise,
    )


def build_trend(rows: list[dict], txns: list[ledger.Txn], start: date, today: date) -> list[TrendPoint]:
    """One point per day: bank + cash at the end of it (None before any account
    opened) and what was spent that day."""
    accounts = [ledger.Account(id=r["id"], kind=r["kind"]) for r in rows]
    available = [a for a in accounts if a.kind in ledger.AVAILABLE_KINDS]
    spent: dict[date, int] = {}
    for t in txns:
        if ledger.counts_as_expense(t):
            spent[t.occurred_on] = spent.get(t.occurred_on, 0) + t.amount_paise
    points = []
    for offset in range((today - start).days + 1):
        day = date.fromordinal(start.toordinal() + offset)
        known = [b for b in ledger.account_balances_on(available, txns, day).values() if b is not None]
        points.append(
            TrendPoint(date=day, balance_paise=sum(known) if known else None, spent_paise=spent.get(day, 0))
        )
    return points
