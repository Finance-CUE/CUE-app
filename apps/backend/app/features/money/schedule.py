"""Scheduled payments and recurring income (spec 4.8): when each item falls due.
Pure: no I/O.

An item is due once per period on its billing day, clamped to the month's
length. Each due date is answered at most once (paid or skipped) in
subscription_cycles, keyed by the first of its month. A due date that passes
without an answer stays open ("Was it paid?"): it is never marked paid by itself.
"""

from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import date
from typing import Literal

from app.features.money.service import billing_date

ScheduleKind = Literal["subscription", "bill", "rent", "emi", "other", "income"]
Frequency = Literal["monthly", "quarterly", "yearly", "once"]
Status = Literal["due", "paid", "skipped"]

_STEP_MONTHS: dict[str, int] = {"monthly": 1, "quarterly": 3, "yearly": 12}
# A guard against looping forever on bad data: 50 years of monthly dues.
_MAX_STEPS = 600


@dataclass(frozen=True)
class Item:
    id: str
    name: str
    kind: ScheduleKind
    frequency: Frequency
    amount_paise: int
    billing_day: int
    starts_on: date
    first_due_on: date | None
    active: bool
    account_id: str | None = None
    category: str | None = None
    variable: bool = False
    reminder: bool = True


@dataclass(frozen=True)
class Answer:
    status: Literal["paid", "skipped"]
    transaction_id: str | None


@dataclass(frozen=True)
class Occurrence:
    item: Item
    due_on: date
    status: Status
    transaction_id: str | None = None

    @property
    def month(self) -> date:
        return self.due_on.replace(day=1)


def add_months(first: date, months: int) -> date:
    """The first of the month `months` after `first` (a first of month)."""
    index = first.year * 12 + first.month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


def first_due(item: Item) -> date:
    """The first due date. Items from before sql/012 have none stored: theirs is
    the first billing day after starts_on, as the old routes count it."""
    if item.first_due_on is not None:
        return item.first_due_on
    month = item.starts_on.replace(day=1)
    due = billing_date(month, item.billing_day)
    return due if due > item.starts_on else billing_date(add_months(month, 1), item.billing_day)


def due_dates(item: Item, until: date) -> Iterator[date]:
    """Every due date from the first up to and including `until`."""
    first = first_due(item)
    if item.frequency == "once":
        if first <= until:
            yield first
        return
    step = _STEP_MONTHS[item.frequency]
    month = first.replace(day=1)
    for _ in range(_MAX_STEPS):
        due = billing_date(month, item.billing_day)
        if due > until:
            return
        if due >= first:
            yield due
        month = add_months(month, step)


def occurrences(
    items: Iterable[Item],
    answers: dict[tuple[str, date], Answer],
    start: date,
    end: date,
    open_before: bool = False,
) -> list[Occurrence]:
    """Due dates from start to end with their status, soonest first.

    open_before also returns unanswered due dates before `start` (overdue,
    "Was it paid?"). A cancelled item keeps only the dates already answered,
    so its paid and skipped months still show in the calendar.
    """
    found: list[Occurrence] = []
    for item in items:
        for due in due_dates(item, end):
            answer = answers.get((item.id, due.replace(day=1)))
            if due < start and not (open_before and answer is None and item.active):
                continue
            if answer is None:
                if not item.active:
                    continue
                found.append(Occurrence(item, due, "due"))
            else:
                found.append(Occurrence(item, due, answer.status, answer.transaction_id))
    return sorted(found, key=lambda o: (o.due_on, o.item.name.casefold()))


def next_due(item: Item, answers: dict[tuple[str, date], Answer], today: date) -> date | None:
    """The first unanswered due date on or after today; None once cancelled."""
    if not item.active:
        return None
    horizon = add_months(today.replace(day=1), 13 if item.frequency != "once" else 1200)
    for due in due_dates(item, horizon):
        if due >= today and (item.id, due.replace(day=1)) not in answers:
            return due
    return None


def is_payment(item: Item) -> bool:
    """Money going out (a due). Recurring income is expected, not owed."""
    return item.kind != "income"
