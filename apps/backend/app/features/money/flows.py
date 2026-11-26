"""Money in and out (dashboard spec P1, sections 4.2, 4.3, 4.4, 4.6 and 8). Pure: no I/O.

All figures read the ledger by the date a transaction happened. Income is
income transactions only; expenses are consumption: expense transactions
minus refunds (suggestion 26). Transfers, lending, repayments, openings and
adjustments are neither.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from app.features.money import ledger
from app.features.money.ledger import Account, Txn
from app.features.money.schedule import add_months

Period = Literal["week", "month", "quarter"]


def month_end(first: date) -> date:
    return add_months(first, 1) - timedelta(days=1)


def _between(txns: Iterable[Txn], start: date, end: date) -> list[Txn]:
    return [t for t in txns if start <= t.occurred_on <= end]


def income_between(txns: Iterable[Txn], start: date, end: date) -> tuple[int, int]:
    """(all income, salary) dated start..end."""
    total = salary = 0
    for t in _between(txns, start, end):
        if ledger.counts_as_income(t):
            total += t.amount_paise
            if t.category == "salary":
                salary += t.amount_paise
    return total, salary


def expenses_between(txns: Iterable[Txn], start: date, end: date) -> int:
    """Consumption expenses − refunds dated start..end."""
    return sum(by_category(txns, start, end).values())


def by_category(txns: Iterable[Txn], start: date, end: date) -> dict[str, int]:
    """Spending per category, refunds taken off their own category. Largest first;
    a category that nets to zero or below is left out."""
    totals: dict[str, int] = {}
    for t in _between(txns, start, end):
        if ledger.counts_as_expense(t):
            totals[t.category or "other"] = totals.get(t.category or "other", 0) + t.amount_paise
        elif t.type == "refund":
            totals[t.category or "other"] = totals.get(t.category or "other", 0) - t.amount_paise
    return dict(sorted(((c, p) for c, p in totals.items() if p > 0), key=lambda cp: -cp[1]))


def savings_rate(income: int, savings: int) -> int | None:
    """Savings ÷ income × 100, rounded; None ("—") when there is no income."""
    if income <= 0:
        return None
    return round(savings * 100 / income)


def same_days_last_month(today: date) -> tuple[date, date]:
    """1st to the same day of last month (clamped to its length): suggestion 12."""
    first = add_months(today.replace(day=1), -1)
    return first, min(first + timedelta(days=today.day - 1), month_end(first))


@dataclass(frozen=True)
class MonthFigures:
    month: date
    income: int
    salary: int
    expenses: int

    @property
    def other_income(self) -> int:
        return self.income - self.salary

    @property
    def savings(self) -> int:
        return self.income - self.expenses

    @property
    def rate(self) -> int | None:
        return savings_rate(self.income, self.savings)


def month_figures(txns: list[Txn], first: date, until: date) -> MonthFigures:
    end = min(month_end(first), until)
    income, salary = income_between(txns, first, end)
    return MonthFigures(month=first, income=income, salary=salary, expenses=expenses_between(txns, first, end))


def monthly_series(txns: list[Txn], today: date, count: int = 6) -> list[MonthFigures]:
    """The last `count` months, oldest first; this month runs to today."""
    first = today.replace(day=1)
    return [month_figures(txns, add_months(first, -i), today) for i in range(count - 1, -1, -1)]


def daily_average(expenses: int, today: date) -> int:
    """This month's expenses ÷ days elapsed, counting today."""
    return expenses // today.day


# Cash flow (4.6) -----------------------------------------------------------------


@dataclass(frozen=True)
class Bucket:
    start: date
    end: date
    income: int
    expenses: int
    count: int  # income and expense entries in the bucket


def _bucket(txns: list[Txn], start: date, end: date) -> Bucket:
    inside = _between(txns, start, end)
    income, _ = income_between(inside, start, end)
    count = sum(1 for t in inside if t.type in ("income", "expense", "refund"))
    return Bucket(start, end, income, expenses_between(inside, start, end), count)


def cash_flow_buckets(txns: list[Txn], period: Period, on: date) -> list[Bucket]:
    """Week: Monday to Sunday around `on`. Month: the weeks of on's month, cut to
    the month. Quarter (3 Months): on's month and the two before. Transfers never count."""
    if period == "week":
        monday = on - timedelta(days=on.weekday())
        return [_bucket(txns, d, d) for d in (monday + timedelta(days=i) for i in range(7))]
    if period == "month":
        first, last = on.replace(day=1), month_end(on.replace(day=1))
        buckets, start = [], first
        while start <= last:
            end = min(start + timedelta(days=6 - start.weekday()), last)
            buckets.append(_bucket(txns, start, end))
            start = end + timedelta(days=1)
        return buckets
    first = on.replace(day=1)
    return [
        _bucket(txns, m, month_end(m)) for m in (add_months(first, -i) for i in (2, 1, 0))
    ]


def history_start(txns: Iterable[Txn]) -> date | None:
    """The first day with data: the earliest opening balance (suggestion 11)."""
    openings = [t.occurred_on for t in txns if t.type == "opening"]
    return min(openings) if openings else None


def enough_for_cash_flow(txns: list[Txn], today: date) -> bool:
    """At least 3 days of data, counting from the first opening balance."""
    start = history_start(txns)
    return start is not None and (today - start).days >= 2


# Net worth history (4.3) ---------------------------------------------------------


def net_worth_history(accounts: list[Account], txns: list[Txn], start: date, end: date) -> list[tuple[date, int]]:
    """Net worth at the end of each day, start..end. Days before the user's first
    data are not drawn: the line starts at their opening balances."""
    first = history_start(txns)
    if first is None:
        return []
    day = max(start, first)
    points = []
    while day <= end:
        points.append((day, ledger.position_on(accounts, txns, day).net_worth_paise))
        day += timedelta(days=1)
    return points


# Left to spend (4.2, section 8) ---------------------------------------------------


def left_to_spend_today(free_paise: int, dues_before_salary: int, today: date, next_salary: date) -> int:
    """(Free balance − upcoming dues before the next salary) ÷ days until it.
    Today counts as a day, so the night before payday still has one."""
    days = max((next_salary - today).days, 1)
    return (free_paise - dues_before_salary) // days
