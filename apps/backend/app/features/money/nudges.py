"""Spend-nudge planning: pure logic, no I/O.

Everything is computed in IST (a fixed +05:30 offset; India has no DST).
"""

import re
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from app.features.money.schemas import Nudges, PlannedNudge, Spend

IST = timezone(timedelta(hours=5, minutes=30))

HORIZON_DAYS = 7
HISTORY_DAYS = 28
PATTERN_MIN_COUNT = 3
PRE_SPEND_MIN_DAYS = 3
LEAD = timedelta(minutes=15)
# category -> label that reads naturally mid-sentence ("3 spends on going out")
DISCRETIONARY = {"food": "food orders", "shopping": "shopping", "fun": "going out"}

MERCHANTS: dict[str, str] = {
    "zomato": "Zomato",
    "swiggy": "Swiggy",
    "blinkit": "Blinkit",
    "zepto": "Zepto",
    "instamart": "Instamart",
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

# archetype slug -> kind -> two (title, body) variants. Placeholders: {label} {count} {total}.
# {label} is a merchant ("Zomato") or a lowercase category ("food orders", "going out"), so it
# only ever appears mid-sentence, after "on"/"for"/"skip"/"before"; nouns stay neutral ("spends").
TEMPLATES: dict[str, dict[str, tuple[tuple[str, str], tuple[str, str]]]] = {
    "dreamer": {
        "pattern": (
            ("Your dream fund noticed", "{count} spends on {label} this week, {total}. Park that toward the goal you picture."),
            ("Small buys, big dream", "{total} on {label} in 7 days. Move some of it to your dream fund."),
        ),
        "pre_spend": (
            ("Almost time for {label}", "Your usual time for {label} is near. Skip it once and feed your dream fund."),
            ("Before the habit kicks in", "Your future self is watching. Save this spend on {label} for the goal."),
        ),
    },
    "comfort_spender": {
        "pattern": (
            ("Be kind to yourself", "{count} spends on {label} this week, {total}. A gentler comfort could save you some."),
            ("A gentle check-in", "{total} on {label} lately. What would really help right now? Maybe it is free."),
        ),
        "pre_spend": (
            ("A soft pause", "Your usual time for {label} is near. Breathe first; the urge may pass and save you."),
            ("Care without the cost", "You often spend on {label} around now. Try a free comfort and keep the money."),
        ),
    },
    "social_spender": {
        "pattern": (
            ("Your crew, your wallet", "{count} spends on {label}, {total}. Pick a cheaper plan with friends this time."),
            ("Fun with friends, less spend", "{total} on {label} this week. Suggest a low-cost hangout and save."),
        ),
        "pre_spend": (
            ("Plans around {label}?", "Your usual time for {label} is near. Invite people to something free and save."),
            ("Heads up before {label}", "Friends will get it if you skip {label} once. Keep the money."),
        ),
    },
    "thrill_chaser": {
        "pattern": (
            ("Challenge accepted?", "{count} spends on {label} in 7 days, {total}. Beat your record: skip the next one."),
            ("New game: save it", "{total} on {label} lately. Make saving the thrill and win this round."),
        ),
        "pre_spend": (
            ("Dare to skip {label}", "Your usual time for {label} is near. Skip it and bank the win."),
            ("Level up your savings", "It is nearly time for {label}. Keep the money for a bigger prize."),
        ),
    },
    "prepared_one": {
        "pattern": (
            ("Spotted a pattern", "{count} spends on {label} this week, {total}. Check it against your plan."),
            ("Budget check", "{total} on {label} in 7 days. Is it in the plan? Adjust and save."),
        ),
        "pre_spend": (
            ("Planned or impulse?", "Your usual time for {label} is near. If unplanned, skip it and save."),
            ("A quick plan check", "It is nearly time for {label}. Stick to the budget and keep the money."),
        ),
    },
    "optimizer": {
        "pattern": (
            ("The numbers on {label}", "{count} spends, {total} in 7 days. Cut one a week to save more."),
            ("Efficiency alert", "{total} went on {label} this week across {count} spends. Trim and save."),
        ),
        "pre_spend": (
            ("Habit in 15 minutes", "Your usual time for {label} is close. Skipping once is a free, instant return."),
            ("Run the numbers", "Your usual spend on {label} is near. Is it the best use of this money?"),
        ),
    },
    "outrunner": {
        "pattern": (
            ("Quick look, no stress", "{count} spends on {label} this week, {total}. One small cut starts a saving habit."),
            ("Just a peek", "{total} on {label} in 7 days. Skip one and you are already saving."),
        ),
        "pre_spend": (
            ("Tiny step, big relief", "Your usual time for {label} is near. Skip it once and keep the money."),
            ("Easy win ahead", "It is nearly time for {label}. Not spending is the simplest way to save."),
        ),
    },
    "curator": {
        "pattern": (
            ("Choose what counts", "{count} spends on {label}, {total} this week. Keep the best, skip the rest."),
            ("Quality over quantity", "{total} on {label} in 7 days. Pick the one you love and save."),
        ),
        "pre_spend": (
            ("Is it worth it?", "Your usual time for {label} is near. Only buy what you will truly love."),
            ("Be picky today", "It is nearly time for {label}. Wait a day on it and save if it fades."),
        ),
    },
    "autopilot": {
        "pattern": (
            ("Noticed a habit", "{count} spends on {label} in 7 days, {total}. Pause once and decide on purpose."),
            ("Wake the autopilot", "{total} on {label} this week. Choose it, or skip it and save."),
        ),
        "pre_spend": (
            ("Habit hour ahead", "You usually spend on {label} about now. Decide first, then tap."),
            ("Pause before {label}", "Make this one a choice, not a habit. Skipping saves money."),
        ),
    },
    "survival_saver": {
        "pattern": (
            ("Every rupee counts", "{count} spends on {label}, {total} this week. Cutting one protects your cushion."),
            ("Protect your cushion", "{total} on {label} in 7 days. A skip now adds to your safety net."),
        ),
        "pre_spend": (
            ("Safety net check", "Your usual time for {label} is near. Skipping once strengthens your cushion."),
            ("Hold on to it", "It is nearly time for {label}. Keep this money in your safety net."),
        ),
    },
    "default": {
        "pattern": (
            ("Spending pattern spotted", "{count} spends on {label} this week, {total}. Skip the next one and save."),
            ("Quick money check", "{total} on {label} in 7 days. Cutting back a little adds up."),
        ),
        "pre_spend": (
            ("Heads up on {label}", "Your usual time for {label} is near. Skip it once and save."),
            ("Save a little today", "It is nearly time for {label}. Keeping this money helps your savings."),
        ),
    },
}


def format_rupees(paise: int) -> str:
    """Whole rupees (half up) with Indian digit grouping, e.g. 12400000 -> ₹1,24,000."""
    digits = str((paise + 50) // 100)
    head, tail = digits[:-3], digits[-3:]
    if head:
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        groups.insert(0, head)
        tail = ",".join([*groups, tail])
    return f"₹{tail}"


def group_key(spend: Spend) -> tuple[str, str] | None:
    """(key, display label): a known merchant, else a discretionary category, else None."""
    desc = spend.description.lower()
    for keyword, label in MERCHANTS.items():
        if re.search(rf"\b{re.escape(keyword)}\b", desc):
            return keyword.replace(" ", "_"), label
    if spend.category in DISCRETIONARY:
        return spend.category, DISCRETIONARY[spend.category]
    return None


def _created_ist(spend: Spend) -> datetime:
    created = spend.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return created.astimezone(IST)


def _spend_hour(spend: Spend) -> int | None:
    local = _created_ist(spend)
    return local.hour if local.date() == spend.spent_on else None


def _quiet(t: datetime) -> bool:
    return t.hour >= 22 or t.hour < 8


def _pattern_fire_at(anchor: datetime) -> datetime:
    t = anchor + LEAD
    if t.hour >= 22:
        t = t + timedelta(days=1)
    if _quiet(t):
        t = t.replace(hour=8, minute=0, second=0, microsecond=0)
    return t


def _render(slug: str | None, kind: str, fire_at: datetime, label: str, count: int, total: int):
    variants = TEMPLATES.get(slug or "", TEMPLATES["default"])[kind]
    title, body = variants[fire_at.date().toordinal() % len(variants)]
    fmt = {"label": label, "count": count, "total": format_rupees(total)}
    return title.format(**fmt), body.format(**fmt)


def _pattern(spends: list[Spend], today: date, now: datetime):
    first = today - timedelta(days=HORIZON_DAYS - 1)
    stats: dict[str, list] = defaultdict(lambda: [0, 0, "", None])  # count, total, label, latest
    for s in spends:
        g = group_key(s)
        if g is None or not first <= s.spent_on <= today:
            continue
        row = stats[g[0]]
        row[0] += 1
        row[1] += s.amount_paise
        row[2] = g[1]
        created = _created_ist(s)
        row[3] = created if row[3] is None else max(row[3], created)
    hits = {k: v for k, v in stats.items() if v[0] >= PATTERN_MIN_COUNT}
    if not hits:
        return None
    key = max(hits, key=lambda k: (hits[k][1], k))
    count, total, label, latest = hits[key]
    # Anchored to the triggering spend, not `now`, so refetches don't re-fire or drift it.
    # ponytail: the one-per-day cap is per plan, so a pre-spend that already fired earlier
    # today plus a pattern later the same day can both fire; track fired ids if that matters.
    fire = _pattern_fire_at(latest)
    if fire <= now:
        return None  # already fired, or its moment passed
    return key, (count, total, label), fire


def _pre_spend(spends: list[Spend], today: date):
    first = today - timedelta(days=HISTORY_DAYS - 1)
    days: dict[tuple[str, int], set[date]] = defaultdict(set)
    totals: dict[tuple[str, int], int] = defaultdict(int)
    labels: dict[str, str] = {}
    for s in spends:
        g = group_key(s)
        hour = _spend_hour(s)
        if g is None or hour is None or not first <= s.spent_on <= today:
            continue
        days[(g[0], hour)].add(s.spent_on)
        totals[(g[0], hour)] += s.amount_paise
        labels[g[0]] = g[1]
    hits = {
        k: v
        for k, v in days.items()
        if len(v) >= PRE_SPEND_MIN_DAYS and not _quiet(datetime.combine(today, time(k[1])) - LEAD)
    }
    if not hits:
        return None
    key, hour = max(hits, key=lambda k: (len(hits[k]), k))
    return key, hour, labels[key], len(hits[(key, hour)]), totals[(key, hour)]


def build_plan(
    spends: list[Spend], archetype_slug: str | None, prefs: Nudges, now: datetime
) -> list[PlannedNudge]:
    now = now.astimezone(IST)
    today = now.date()
    by_day: dict[date, PlannedNudge] = {}

    if prefs.pre_spend and (found := _pre_spend(spends, today)):
        key, hour, label, count, total = found
        for offset in range(HORIZON_DAYS):
            day = today + timedelta(days=offset)
            fire = datetime.combine(day, time(hour), tzinfo=IST) - LEAD
            if fire <= now or _quiet(fire):
                continue
            title, body = _render(archetype_slug, "pre_spend", fire, label, count, total)
            by_day[day] = PlannedNudge(
                id=f"pre_spend:{key}:{fire.date()}",
                kind="pre_spend", title=title, body=body, fire_at=fire,
            )  # fmt: skip

    if prefs.patterns and (found := _pattern(spends, today, now)):
        key, (count, total, label), fire = found
        title, body = _render(archetype_slug, "pattern", fire, label, count, total)
        by_day[fire.date()] = PlannedNudge(
            id=f"pattern:{key}:{fire.date()}",
            kind="pattern", title=title, body=body, fire_at=fire,
        )  # fmt: skip

    return sorted(by_day.values(), key=lambda n: n.fire_at)
