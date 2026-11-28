"""Pure money logic: subscription billing dates. No I/O.

Balances, net worth and the trend come from the ledger (ledger.py, legacy.py)."""

import calendar
from datetime import date, timedelta


def billing_date(month_first: date, billing_day: int) -> date:
    """The billing day within a month, clamped to its length (31 -> 28 in Feb).

    Always derived from the stored day, so a clamp never drifts into later months.
    """
    last = calendar.monthrange(month_first.year, month_first.month)[1]
    return month_first.replace(day=min(billing_day, last))


def _next_month(month_first: date) -> date:
    return (month_first + timedelta(days=31)).replace(day=1)


def next_billing_on(billing_day: int, starts_on: date, answered: set[date], today: date) -> date:
    """First billing date on or after today that is after starts_on and whose month is unanswered."""
    month = today.replace(day=1)
    while True:  # ends: answered is finite
        due = billing_date(month, billing_day)
        if due >= today and due > starts_on and month not in answered:
            return due
        month = _next_month(month)


def due_months(
    billing_day: int, starts_on: date, answered: set[date], today: date
) -> list[date]:
    """First-of-month dates whose billing date is after starts_on, not after today, unanswered."""
    month, due = starts_on.replace(day=1), []
    while month <= today:
        if starts_on < billing_date(month, billing_day) <= today and month not in answered:
            due.append(month)
        month = _next_month(month)
    return due
