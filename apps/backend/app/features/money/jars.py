"""Goal Jars (dashboard spec P2, sections 4.5, 4.7 and 8). Pure: no I/O.

A jar sets money aside inside an account. Moves only change allocations:
balances and net worth never move, and a withdrawal is never income.

Formulas (section 8):
  Free balance        = account balance − money in jars on that account
  Goal progress       = allocated ÷ target × 100
  Goal remaining      = target − allocated
  Suggested monthly   = remaining ÷ months left to the target date (at least 1)
"""

import calendar
import math
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

Method = Literal["manual", "weekly", "monthly", "payday"]
Status = Literal["active", "paused", "complete", "archived"]

# Suggestion 17: more than this many points behind the expected progress.
BEHIND_POINTS = 10


@dataclass(frozen=True)
class Jar:
    id: str
    name: str
    target_paise: int
    target_date: date | None
    account_id: str
    method: Method
    contribution_paise: int | None
    next_contribution_on: date | None
    status: Status
    created_on: date


@dataclass(frozen=True)
class Move:
    id: str
    jar_id: str
    amount_paise: int  # positive adds, negative withdraws
    account_id: str
    occurred_on: date


def saved(jar_id: str, moves: Iterable[Move]) -> int:
    """Money in one jar: the sum of its moves."""
    return sum(m.amount_paise for m in moves if m.jar_id == jar_id)


def in_jars_by_account(moves: Iterable[Move]) -> dict[str, int]:
    """Money in jars per account."""
    totals: dict[str, int] = {}
    for m in moves:
        totals[m.account_id] = totals.get(m.account_id, 0) + m.amount_paise
    return totals


def free_balance(balance_paise: int | None, in_jars_paise: int) -> int | None:
    """Account balance − money in jars on it. None before the account's "Balance on" date."""
    return None if balance_paise is None else balance_paise - in_jars_paise


def progress(saved_paise: int, target_paise: int) -> int:
    """Allocated ÷ target × 100, rounded down, capped at 100."""
    return min(100, max(0, saved_paise * 100 // target_paise))


def months_left(today: date, target: date) -> int:
    """Whole months from today to the target date, rounded up, at least 1."""
    months = (target.year - today.year) * 12 + (target.month - today.month)
    if target.day > today.day:
        months += 1
    return max(1, months)


def suggested_monthly(saved_paise: int, target_paise: int, target_date: date | None, today: date) -> int | None:
    """Remaining ÷ months left (at least 1); None without a target date or once reached."""
    remaining = target_paise - saved_paise
    if target_date is None or remaining <= 0:
        return None
    return math.ceil(remaining / months_left(today, target_date))


def is_behind(jar: Jar, saved_paise: int, today: date) -> bool:
    """Suggestion 17: expected progress = time since the jar was made ÷ time to its
    target date. Behind when actual progress trails it by more than 10 points.
    No tag without a target date, once the date has passed, or unless active."""
    if jar.status != "active" or jar.target_date is None or today > jar.target_date:
        return False
    span = (jar.target_date - jar.created_on).days
    if span <= 0:
        return False
    expected = (today - jar.created_on).days * 100 / span
    actual = saved_paise * 100 / jar.target_paise
    return actual < expected - BEHIND_POINTS


def add_months(day: date, months: int) -> date:
    """The same day `months` later, clamped to the month's length."""
    index = day.year * 12 + day.month - 1 + months
    year, month = divmod(index, 12)
    month += 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def next_contribution(method: Method, after: date, next_payday: date | None) -> date | None:
    """The next suggested contribution date after `after`. Every payday: the day
    after the next expected salary, or None when no salary is set up."""
    if method == "weekly":
        return after + timedelta(days=7)
    if method == "monthly":
        return add_months(after, 1)
    if method == "payday":
        return next_payday + timedelta(days=1) if next_payday is not None else None
    return None


def first_contribution(method: Method, today: date, next_payday: date | None) -> date | None:
    """The first suggestion for a new jar or a changed method: a week or month from
    today, or the day after the next payday."""
    return next_contribution(method, today, next_payday)


def contribution_due(jar: Jar, today: date) -> bool:
    """A suggested contribution waiting for approval. Never added by itself."""
    return (
        jar.status == "active"
        and jar.method != "manual"
        and jar.contribution_paise is not None
        and jar.next_contribution_on is not None
        and jar.next_contribution_on <= today
    )


def state(jar: Jar, saved_paise: int, today: date) -> Literal["active", "paused", "complete", "date_passed"]:
    """What the card shows: paused, reached, past its date or active."""
    if jar.status == "complete":
        return "complete"
    if jar.status == "paused":
        return "paused"
    if jar.target_date is not None and today > jar.target_date and saved_paise < jar.target_paise:
        return "date_passed"
    return "active"


def can_add(amount_paise: int, free_paise: int | None) -> bool:
    """Allocation guard (suggestion 17): never more than the account's free balance."""
    return free_paise is not None and amount_paise <= free_paise
