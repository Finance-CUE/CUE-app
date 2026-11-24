"""The account ledger's formulas (dashboard spec section 8). Pure: no I/O.

Every figure on Today comes from here, read by the date a transaction happened
(occurred_on), never by when it was entered. The app displays the results; it
does not do its own sums.

Conventions match sql/010_ledger.sql: amounts are paise; amount_paise is a
positive magnitude except for 'opening' and 'adjustment', which are signed; a
credit card's balance is negative while money is due on it.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal

AccountKind = Literal["savings", "current", "cash", "credit_card", "other"]
TxnType = Literal[
    "opening",
    "income",
    "expense",
    "transfer",
    "refund",
    "adjustment",
    "lend",
    "borrow",
    "repayment_received",
    "repayment_made",
]

# "Available balance: sum of cash, savings and current account balances."
AVAILABLE_KINDS: frozenset[str] = frozenset({"savings", "current", "cash"})

# Money in or out of the account named by account_id. Transfers also add to to_account_id.
_INTO_ACCOUNT: frozenset[str] = frozenset({"income", "refund", "borrow", "repayment_received"})
_OUT_OF_ACCOUNT: frozenset[str] = frozenset({"expense", "lend", "repayment_made", "transfer"})


@dataclass(frozen=True)
class Account:
    id: str
    kind: AccountKind


@dataclass(frozen=True)
class Txn:
    id: str
    type: TxnType
    amount_paise: int
    occurred_on: date
    created_at: datetime
    account_id: str | None = None
    to_account_id: str | None = None
    khata_entry_id: str | None = None
    category: str | None = None


@dataclass(frozen=True)
class Position:
    """Where the user stood at the end of one day (the "Your position on" sheet)."""

    available_paise: int
    other_assets_paise: int
    receivables_paise: int
    card_dues_paise: int
    borrowings_paise: int
    other_liabilities_paise: int

    @property
    def total_assets_paise(self) -> int:
        """Cash + bank + receivables + other assets."""
        return self.available_paise + self.other_assets_paise + self.receivables_paise

    @property
    def total_liabilities_paise(self) -> int:
        """Credit card dues + borrowings + other liabilities."""
        return self.card_dues_paise + self.borrowings_paise + self.other_liabilities_paise

    @property
    def net_worth_paise(self) -> int:
        """Total assets − total liabilities."""
        return self.total_assets_paise - self.total_liabilities_paise


# What each transaction type does ------------------------------------------------


def effects(t: Txn) -> list[tuple[str, int]]:
    """(account id, signed change) for each account the transaction moves."""
    if t.type == "transfer":
        assert t.account_id and t.to_account_id
        return [(t.account_id, -t.amount_paise), (t.to_account_id, t.amount_paise)]
    if t.account_id is None:
        return []  # copied from before the ledger: no account moved
    if t.type in ("opening", "adjustment"):
        return [(t.account_id, t.amount_paise)]
    if t.type in _INTO_ACCOUNT:
        return [(t.account_id, t.amount_paise)]
    if t.type in _OUT_OF_ACCOUNT:
        return [(t.account_id, -t.amount_paise)]
    raise ValueError(f"unknown transaction type {t.type!r}")


def counts_as_income(t: Txn) -> bool:
    """Only income. Refunds reduce expenses instead (suggestion 26); openings,
    borrowing, repayments, transfers and adjustments are never income."""
    return t.type == "income"


def counts_as_expense(t: Txn) -> bool:
    """Consumption: expenses, card spends included on the swipe date. Never
    transfers, card bill payments, lending, repayments, openings or adjustments."""
    return t.type == "expense"


# Balances -----------------------------------------------------------------------


def _key(t: Txn) -> tuple[date, datetime]:
    return (t.occurred_on, t.created_at)


def _openings(txns: Iterable[Txn]) -> dict[str, Txn]:
    return {t.account_id: t for t in txns if t.type == "opening" and t.account_id}


def account_balances_on(accounts: Iterable[Account], txns: list[Txn], day: date) -> dict[str, int | None]:
    """Each account's balance at the end of `day`; None before its opening date.

    "Balance on" (suggestion 13): the opening is the balance as it stood on its
    date, so a transaction moves it only if dated after the opening, or on the
    same day and entered after it. A spend from last week added after setup is
    not subtracted twice.
    """
    openings = _openings(txns)
    balances: dict[str, int | None] = {}
    for a in accounts:
        opening = openings.get(a.id)
        if opening is not None and day < opening.occurred_on:
            balances[a.id] = None
            continue
        balances[a.id] = opening.amount_paise if opening else 0
    for t in txns:
        if t.type == "opening" or t.occurred_on > day:
            continue
        for account_id, delta in effects(t):
            if balances.get(account_id) is None:
                continue  # unknown account, or before its opening
            opening = openings.get(account_id)
            if opening is not None and _key(t) <= _key(opening):
                continue  # already inside the opening balance
            balances[account_id] += delta
    return balances


def account_movements(account_id: str, txns: list[Txn], start: date, end: date) -> tuple[int, int]:
    """(money in, money out) of one account for transactions dated start..end.

    Counts what moved the balance: never the opening, and nothing already
    inside the opening balance ("Balance on"). Transfers count on both sides.
    """
    opening = _openings(txns).get(account_id)
    money_in = money_out = 0
    for t in txns:
        if t.type == "opening" or not (start <= t.occurred_on <= end):
            continue
        if opening is not None and _key(t) <= _key(opening):
            continue
        for acct, delta in effects(t):
            if acct != account_id:
                continue
            if delta > 0:
                money_in += delta
            else:
                money_out -= delta
    return money_in, money_out


@dataclass(frozen=True)
class AccountMonth:
    month: date  # first of the month
    money_in: int
    money_out: int
    closing: int | None  # end of the month, or today for this month; None before the opening


def account_months(account: Account, txns: list[Txn], today: date, count: int = 6) -> list[AccountMonth]:
    """Month by month, newest first: the account screen's history (spec 4.5)."""
    months: list[AccountMonth] = []
    first = today.replace(day=1)
    for _ in range(count):
        next_first = (first + timedelta(days=32)).replace(day=1)
        end = min(next_first - timedelta(days=1), today)
        money_in, money_out = account_movements(account.id, txns, first, end)
        closing = account_balances_on([account], txns, end)[account.id]
        months.append(AccountMonth(month=first, money_in=money_in, money_out=money_out, closing=closing))
        first = (first - timedelta(days=1)).replace(day=1)
    return months


def khata_outstanding_on(txns: Iterable[Txn], day: date) -> tuple[int, int]:
    """(money lent outstanding, money borrowed outstanding) at the end of `day`.

    Lent − repayments received; borrowed − repayments made. These do not depend
    on any account's opening: a receivable exists whichever account paid it.
    """
    lent = borrowed = 0
    for t in txns:
        if t.occurred_on > day:
            continue
        if t.type == "lend":
            lent += t.amount_paise
        elif t.type == "repayment_received":
            lent -= t.amount_paise
        elif t.type == "borrow":
            borrowed += t.amount_paise
        elif t.type == "repayment_made":
            borrowed -= t.amount_paise
    return lent, borrowed


def position_on(accounts: list[Account], txns: list[Txn], day: date) -> Position:
    """Assets, liabilities and net worth as the ledger stood at the end of `day`."""
    balances = account_balances_on(accounts, txns, day)
    available = other_assets = card_dues = other_liabilities = 0
    for a in accounts:
        b = balances.get(a.id)
        if b is None:
            continue
        if a.kind in AVAILABLE_KINDS:
            available += b
        elif b < 0:
            # A card with money due, or any other account in debt.
            if a.kind == "credit_card":
                card_dues += -b
            else:
                other_liabilities += -b
        else:
            other_assets += b  # an overpaid card, or a positive "other" account
    lent, borrowed = khata_outstanding_on(txns, day)
    return Position(
        available_paise=available,
        other_assets_paise=other_assets,
        receivables_paise=max(lent, 0),
        card_dues_paise=card_dues,
        borrowings_paise=max(borrowed, 0),
        other_liabilities_paise=other_liabilities,
    )


def change_this_month(accounts: list[Account], txns: list[Txn], today: date) -> int | None:
    """Net worth today − net worth at the end of last month, excluding openings.

    None (the line is hidden) until the user has a full previous month, i.e. the
    first opening is on or before the 1st of last month (suggestion 27). Opening
    balances dated this month are a starting position, not change.
    """
    openings = [t for t in txns if t.type == "opening"]
    if not openings:
        return None
    last_month_end = today.replace(day=1) - timedelta(days=1)
    if min(t.occurred_on for t in openings) > last_month_end.replace(day=1):
        return None
    opened_since = sum(t.amount_paise for t in openings if t.occurred_on > last_month_end)
    now = position_on(accounts, txns, today).net_worth_paise
    then = position_on(accounts, txns, last_month_end).net_worth_paise
    return now - then - opened_since


def reconcile_delta(calculated_paise: int, actual_paise: int) -> int:
    """The adjustment that makes CUE's balance match the bank's. Zero means none is saved."""
    return actual_paise - calculated_paise


def can_archive(balance_paise: int | None) -> bool:
    """Only at ₹0, so money never vanishes from net worth (suggestion 15)."""
    return balance_paise == 0
