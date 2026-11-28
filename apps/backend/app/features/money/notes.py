"""A note from CUE (dashboard spec P4, section 4.10). Pure: no I/O.

One note at a time, chosen by priority (suggestion 19):
  1. a payment due within 3 days
  2. money pending from someone for 14 days or more
  3. a category up 15% or more on the same days last month
  4. a Goal Jar milestone (25, 50, 75, 100%)
  5. a positive streak
The same note isn't shown again within 7 days, and a dismissed one is skipped.
Before about a week of logging there is no note yet.

Notes carry numbers, not sentences: the app writes the words with its own
formatter, so hidden amounts stay hidden. Every note comes from the user's own
data, and its wording observes ("is up"), never judges.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal

from app.features.money import flows
from app.features.money.ledger import Txn

Kind = Literal["due_soon", "pending", "category_up", "jar_milestone", "streak"]

REPEAT_DAYS = 7
DUE_WITHIN = 3
PENDING_DAYS = 14
UP_RATIO = 1.15
# Below this rise (in paise) a 15% jump is noise: ₹10 to ₹12 is not a pattern.
UP_MIN_PAISE = 200_00
MILESTONES = (100, 75, 50, 25)
STREAK_WEEKS = 3
DATA_DAYS = 7


@dataclass(frozen=True)
class Due:
    schedule_id: str
    name: str
    amount_paise: int
    due_on: date


@dataclass(frozen=True)
class Pending:
    person: str
    outstanding_paise: int
    since: date


@dataclass(frozen=True)
class JarState:
    id: str
    name: str
    saved_paise: int
    target_paise: int


@dataclass(frozen=True)
class Seen:
    last_shown_on: date | None = None
    dismissed_on: date | None = None


@dataclass(frozen=True)
class Note:
    key: str
    kind: Kind
    params: dict
    # What "Understand this" shows: the numbers behind the note.
    details: dict = field(default_factory=dict)


def has_enough_data(txns: list[Txn], today: date) -> bool:
    """About a week of logging: the first entry (not an opening balance) is 6+ days old."""
    logged = [t.occurred_on for t in txns if t.type != "opening"]
    return bool(logged) and min(logged) <= today - timedelta(days=DATA_DAYS - 1)


def due_soon(dues: list[Due], today: date) -> Note | None:
    soon = sorted((d for d in dues if today <= d.due_on <= today + timedelta(days=DUE_WITHIN)), key=lambda d: d.due_on)
    if not soon:
        return None
    total = sum(d.amount_paise for d in soon)
    return Note(
        key=f"due:{soon[0].due_on.isoformat()}:{len(soon)}",
        kind="due_soon",
        params={
            "count": len(soon),
            "total_paise": total,
            "name": soon[0].name,
            "amount_paise": soon[0].amount_paise,
            "due_on": soon[0].due_on.isoformat(),
        },
        details={"items": [{"name": d.name, "amount_paise": d.amount_paise, "due_on": d.due_on.isoformat()} for d in soon]},
    )


def pending(owed: list[Pending], today: date) -> Note | None:
    """The person owing the most among those waiting 14+ days."""
    old: dict[str, Pending] = {}
    for p in owed:
        if p.outstanding_paise <= 0 or (today - p.since).days < PENDING_DAYS:
            continue
        key = p.person.strip().casefold()
        cur = old.get(key)
        old[key] = Pending(p.person.strip(), (cur.outstanding_paise if cur else 0) + p.outstanding_paise,
                           min(cur.since, p.since) if cur else p.since)  # fmt: skip
    if not old:
        return None
    top = max(old.values(), key=lambda p: (p.outstanding_paise, -p.since.toordinal()))
    return Note(
        key=f"pending:{top.person.casefold()}",
        kind="pending",
        params={"person": top.person, "amount_paise": top.outstanding_paise, "days": (today - top.since).days},
        details={"since": top.since.isoformat()},
    )


def category_up(txns: list[Txn], today: date) -> Note | None:
    """The category that rose most on the same days of last month (suggestion 12)."""
    first = today.replace(day=1)
    now = flows.by_category(txns, first, today)
    last_start, last_end = flows.same_days_last_month(today)
    then = flows.by_category(txns, last_start, last_end)
    best: tuple[float, str, int, int] | None = None
    for cat, amount in now.items():
        before = then.get(cat, 0)
        if before <= 0 or amount < before * UP_RATIO or amount - before < UP_MIN_PAISE:
            continue
        score = (amount - before) / before
        if best is None or score > best[0]:
            best = (score, cat, amount, before)
    if best is None:
        return None
    _, cat, amount, before = best
    drivers = sorted(
        (t for t in txns if t.type == "expense" and (t.category or "other") == cat and first <= t.occurred_on <= today),
        key=lambda t: -t.amount_paise,
    )[:5]
    return Note(
        key=f"category:{cat}:{first.isoformat()[:7]}",
        kind="category_up",
        params={"category": cat, "percent": round((amount - before) * 100 / before), "now_paise": amount, "then_paise": before},
        details={
            "then_start": last_start.isoformat(),
            "then_end": last_end.isoformat(),
            "transaction_ids": [t.id for t in drivers],
        },
    )


def jar_milestone(jars: list[JarState]) -> Note | None:
    """The highest milestone any jar has reached (the closest to done first)."""
    best: tuple[int, JarState] | None = None
    for j in jars:
        pct = j.saved_paise * 100 // j.target_paise if j.target_paise else 0
        reached = next((m for m in MILESTONES if pct >= m), None)
        if reached and (best is None or reached > best[0]):
            best = (reached, j)
    if best is None:
        return None
    m, j = best
    return Note(
        key=f"jar:{j.id}:{m}",
        kind="jar_milestone",
        params={"jar_id": j.id, "name": j.name, "milestone": m, "saved_paise": j.saved_paise, "target_paise": j.target_paise},
    )


def streak(txns: list[Txn], today: date) -> Note | None:
    """Complete weeks in a row (Monday to Sunday, ending last week) where spending
    stayed below the user's weekly average of the 8 weeks before them."""
    this_monday = today - timedelta(days=today.weekday())
    weeks = []
    for i in range(1, 17):
        start = this_monday - timedelta(weeks=i)
        weeks.append(flows.expenses_between(txns, start, start + timedelta(days=6)))
    # weeks[0] is last week. Average of the 8 weeks before the streak window.
    baseline_weeks = weeks[STREAK_WEEKS : STREAK_WEEKS + 8]
    if len(baseline_weeks) < 8 or sum(baseline_weeks) == 0:
        return None
    average = sum(baseline_weeks) // len(baseline_weeks)
    run = 0
    for w in weeks[:8]:
        if w < average:
            run += 1
        else:
            break
    if run < STREAK_WEEKS:
        return None
    last_monday = this_monday - timedelta(weeks=1)
    return Note(
        key=f"streak:{last_monday.isoformat()}",
        kind="streak",
        params={"weeks": run, "average_paise": average},
        details={"weeks_paise": list(reversed(weeks[:run]))},
    )


def pick(candidates: list[Note | None], seen: dict[str, Seen], today: date) -> Note | None:
    """The first candidate, by priority, not shown on another day in the last 7 days
    and not dismissed in that time. A note shown today stays today's note."""
    for note in candidates:
        if note is None:
            continue
        s = seen.get(note.key, Seen())
        if s.dismissed_on and (today - s.dismissed_on).days < REPEAT_DAYS:
            continue
        if s.last_shown_on and s.last_shown_on != today and (today - s.last_shown_on).days < REPEAT_DAYS:
            continue
        return note
    return None


def choose(
    txns: list[Txn], dues: list[Due], owed: list[Pending], jars: list[JarState], seen: dict[str, Seen], today: date
) -> Note | None:
    return pick(
        [due_soon(dues, today), pending(owed, today), category_up(txns, today), jar_milestone(jars), streak(txns, today)],
        seen,
        today,
    )
