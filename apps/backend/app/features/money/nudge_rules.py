"""Nudge trigger rules: pure logic, no I/O, no templates.

A rule turns spends into `Trigger`s (what fires, when). nudges.py renders them.
Adding a rule = one function + one `RULES` entry (lowest priority first).
"""

import re
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone, tzinfo

from app.features.money.schemas import Spend

HORIZON_DAYS = 7
HISTORY_DAYS = 28
PATTERN_MIN_COUNT = 3
PRE_SPEND_MIN_DAYS = 3
SPIKE_MIN_PAISE = 50_000
SPIKE_MIN_HISTORY_DAYS = 14
WEEKLY_HOUR = 18
LEAD = timedelta(minutes=15)
# category -> label that reads naturally mid-sentence ("3 spends on going out")
DISCRETIONARY = {"food": "food orders", "shopping": "shopping", "fun": "going out"}

# Order matters: the first keyword found wins, so "Swiggy Instamart" groups as Instamart.
MERCHANTS: dict[str, str] = {
    "zomato": "Zomato",
    "instamart": "Instamart",
    "swiggy": "Swiggy",
    "blinkit": "Blinkit",
    "zepto": "Zepto",
    "bigbasket": "BigBasket",
    "uber": "Uber",
    "ola": "Ola",
    "rapido": "Rapido",
    "amazon": "Amazon",
    "flipkart": "Flipkart",
    "myntra": "Myntra",
    "ajio": "Ajio",
    "nykaa": "Nykaa",
    "meesho": "Meesho",
    "starbucks": "Starbucks",
    "blue tokai": "Blue Tokai",
    "third wave": "Third Wave",
    "bookmyshow": "BookMyShow",
    "pvr": "PVR",
}


@dataclass(frozen=True)
class NudgeContext:
    spends: list[Spend]  # already without subscription spends
    now: datetime  # aware, in the user's zone
    today: date
    tz: tzinfo
    booklet: str | None = None


@dataclass(frozen=True)
class Trigger:
    kind: str
    key: str
    fire_at: datetime
    label: str
    count: int
    total: int


@dataclass(frozen=True)
class Rule:
    name: str
    pref: str  # attribute of Nudges that switches the rule on
    evaluate: Callable[[NudgeContext], list[Trigger]]


def group_key(spend: Spend) -> tuple[str, str] | None:
    """(key, display label): a known merchant, else a discretionary category, else None."""
    desc = spend.description.lower()
    for keyword, label in MERCHANTS.items():
        if re.search(rf"\b{re.escape(keyword)}\b", desc):
            return keyword.replace(" ", "_"), label
    if spend.category in DISCRETIONARY:
        return spend.category, DISCRETIONARY[spend.category]
    return None


def created_local(spend: Spend, tz: tzinfo) -> datetime:
    created = spend.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return created.astimezone(tz)


def spend_hour(spend: Spend, tz: tzinfo) -> int | None:
    local = created_local(spend, tz)
    return local.hour if local.date() == spend.spent_on else None


def quiet(t: datetime) -> bool:
    return t.hour >= 22 or t.hour < 8


def after_spend(anchor: datetime) -> datetime:
    """15 minutes after a spend, pushed to 08:00 when that lands in quiet hours."""
    t = anchor + LEAD
    if t.hour >= 22:
        t = t + timedelta(days=1)
    if quiet(t):
        t = t.replace(hour=8, minute=0, second=0, microsecond=0)
    return t


def _pre_spend(ctx: NudgeContext) -> list[Trigger]:
    first = ctx.today - timedelta(days=HISTORY_DAYS - 1)
    days: dict[tuple[str, int], set[date]] = defaultdict(set)
    totals: dict[tuple[str, int], int] = defaultdict(int)
    labels: dict[str, str] = {}
    for s in ctx.spends:
        g = group_key(s)
        hour = spend_hour(s, ctx.tz)
        if g is None or hour is None or not first <= s.spent_on <= ctx.today:
            continue
        days[(g[0], hour)].add(s.spent_on)
        totals[(g[0], hour)] += s.amount_paise
        labels[g[0]] = g[1]
    hits = {
        k: v
        for k, v in days.items()
        if len(v) >= PRE_SPEND_MIN_DAYS
        and not quiet(datetime.combine(ctx.today, time(k[1])) - LEAD)
    }
    if not hits:
        return []
    key, hour = max(hits, key=lambda k: (len(hits[k]), k))
    out = []
    for offset in range(HORIZON_DAYS):
        day = ctx.today + timedelta(days=offset)
        fire = datetime.combine(day, time(hour), tzinfo=ctx.tz) - LEAD
        if fire <= ctx.now or quiet(fire):
            continue
        out.append(
            Trigger("pre_spend", key, fire, labels[key], len(hits[(key, hour)]), totals[(key, hour)])
        )
    return out


def _pattern(ctx: NudgeContext) -> list[Trigger]:
    first = ctx.today - timedelta(days=HORIZON_DAYS - 1)
    stats: dict[str, list] = defaultdict(lambda: [0, 0, "", None])  # count, total, label, latest
    for s in ctx.spends:
        g = group_key(s)
        if g is None or not first <= s.spent_on <= ctx.today:
            continue
        row = stats[g[0]]
        row[0] += 1
        row[1] += s.amount_paise
        row[2] = g[1]
        created = created_local(s, ctx.tz)
        row[3] = created if row[3] is None else max(row[3], created)
    hits = {k: v for k, v in stats.items() if v[0] >= PATTERN_MIN_COUNT}
    if not hits:
        return []
    key = max(hits, key=lambda k: (hits[k][1], k))
    count, total, label, latest = hits[key]
    # Anchored to the triggering spend, not `now`, so refetches don't re-fire or drift it.
    # ponytail: the one-per-day cap is per plan, so a pre-spend that already fired earlier
    # today plus a pattern later the same day can both fire; track fired ids if that matters.
    fire = after_spend(latest)
    if fire <= ctx.now:
        return []  # already fired, or its moment passed
    return [Trigger("pattern", key, fire, label, count, total)]


def _spike(ctx: NudgeContext) -> list[Trigger]:
    recent_from = ctx.today - timedelta(days=HORIZON_DAYS - 1)
    prior_from = recent_from - timedelta(days=21)
    recent = [s for s in ctx.spends if recent_from <= s.spent_on <= ctx.today]
    prior = sum(s.amount_paise for s in ctx.spends if prior_from <= s.spent_on < recent_from)
    total = sum(s.amount_paise for s in recent)
    oldest = min((s.spent_on for s in ctx.spends), default=ctx.today)
    # recent >= 1.5 x (prior / 3 weeks)  <=>  2 * recent >= prior
    if (
        not recent
        or prior <= 0
        or total < SPIKE_MIN_PAISE
        or 2 * total < prior
        or (ctx.today - oldest).days < SPIKE_MIN_HISTORY_DAYS
    ):
        return []
    fire = after_spend(max(created_local(s, ctx.tz) for s in recent))
    if fire <= ctx.now:
        return []
    return [Trigger("spike", "spending", fire, "spending", len(recent), total)]


def _weekly(ctx: NudgeContext) -> list[Trigger]:
    for offset in range(HORIZON_DAYS):
        sunday = ctx.today + timedelta(days=offset)
        if sunday.weekday() != 6:
            continue
        fire = datetime.combine(sunday, time(WEEKLY_HOUR), tzinfo=ctx.tz)
        monday = sunday - timedelta(days=6)
        week = [s for s in ctx.spends if monday <= s.spent_on <= ctx.today]
        if fire <= ctx.now or not week:
            return []
        total = sum(s.amount_paise for s in week)
        return [Trigger("weekly", "week", fire, "this week", len(week), total)]
    return []


# Lowest priority first: on a day with several, the later rule's nudge replaces the earlier.
RULES = [
    Rule("pre_spend", "pre_spend", _pre_spend),
    Rule("pattern", "patterns", _pattern),
    Rule("spike", "patterns", _spike),
    Rule("weekly", "weekly", _weekly),
]
