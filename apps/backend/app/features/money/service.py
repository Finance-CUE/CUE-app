"""Pure money logic: subscription roll-forward and net worth. No I/O."""

import calendar
from datetime import date

from app.features.money.schemas import Cadence, StartingMoney


def _add_months(d: date, months: int) -> date:
    """Shift by whole months, clamping the day to the target month's length."""
    year, month0 = divmod(d.year * 12 + (d.month - 1) + months, 12)
    month = month0 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def roll_forward(next_due_on: date, cadence: Cadence, today: date) -> date:
    """Smallest stored-date + k periods (k >= 0) that is today or later.

    Always stepped from the stored date, never from a clamped result, so a
    31st clamped to 28 Feb returns to the 31st in March.
    """
    step = 1 if cadence == "monthly" else 12
    months = (today.year - next_due_on.year) * 12 + today.month - next_due_on.month
    k = max(0, -(-months // step))  # first period landing in today's month or later
    due = _add_months(next_due_on, k * step)
    if due < today:  # same month, but the (clamped) day has passed
        due = _add_months(next_due_on, (k + 1) * step)
    return due


def net_worth(
    starting: StartingMoney | None,
    assets_paise: int,
    lent_open_paise: int,
    borrowed_open_paise: int,
    spends_since_set_paise: int,
) -> int | None:
    """None until the user has set starting money."""
    if starting is None:
        return None
    return (
        starting.bank_paise
        + starting.cash_paise
        + assets_paise
        + lent_open_paise
        - borrowed_open_paise
        - spends_since_set_paise
    )
