"""Pure money logic: subscription billing dates, net worth and the balance trend. No I/O."""

import calendar
from datetime import date, timedelta, tzinfo

from app.features.money.schemas import BalanceSnapshot, Spend, StartingMoney, TrendPoint


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


def net_worth(
    starting: StartingMoney | None,
    lent_open_paise: int,
    borrowed_open_paise: int,
    spent_since_paise: int = 0,
) -> int | None:
    """None until the user has set starting money.

    The balance the user typed already includes everything spent before that
    moment, so only spends logged after it come off.
    """
    if starting is None:
        return None
    return (
        starting.bank_paise
        + starting.cash_paise
        + lent_open_paise
        - borrowed_open_paise
        - spent_since_paise
    )


def build_trend(
    history: list[BalanceSnapshot], spends: list[Spend], start: date, today: date, tz: tzinfo
) -> list[TrendPoint]:
    """One point per local day: the latest snapshot on or before it, less spends logged
    after that snapshot and dated on or before the day (None before any snapshot)."""
    snaps = sorted(history, key=lambda h: h.recorded_at)
    spent: dict[date, int] = {}
    for s in spends:
        spent[s.spent_on] = spent.get(s.spent_on, 0) + s.amount_paise
    points, i, snap = [], 0, None
    for offset in range((today - start).days + 1):
        day = start + timedelta(days=offset)
        while i < len(snaps) and snaps[i].recorded_at.astimezone(tz).date() <= day:
            snap = snaps[i]
            i += 1
        balance = None
        if snap is not None:
            since = sum(
                s.amount_paise
                for s in spends
                if s.created_at > snap.recorded_at and s.spent_on <= day
            )
            balance = snap.bank_paise + snap.cash_paise - since
        points.append(TrendPoint(date=day, balance_paise=balance, spent_paise=spent.get(day, 0)))
    return points
