"""Spend-nudge planning: pure logic, no I/O.

Times follow the zone of `now` (the user's device zone); the rules live in nudge_rules.py
and the copy comes from the notification_templates table, passed in as `templates`.
"""

import logging
from collections.abc import Sequence
from datetime import datetime, time
from string import Formatter

from app.features.money.nudge_rules import (  # noqa: F401  (re-exported)
    HISTORY_DAYS,
    HORIZON_DAYS,
    RULES,
    NudgeContext,
    Trigger,
    group_key,
    spend_hour,
)
from app.features.money.schemas import (
    NudgeTemplate,
    Nudges,
    PlannedNudge,
    Spend,
    Subscription,
)

logger = logging.getLogger(__name__)

SUBSCRIPTION_HOUR = 10


def _spend_hour(spend: Spend, tz) -> int | None:
    return spend_hour(spend, tz)


def format_rupees(paise: int) -> str:
    """Indian digit grouping with 2 decimals, e.g. 12400000 -> ₹1,24,000.00."""
    rupees, rem = divmod(paise, 100)
    digits = str(rupees)
    head, tail = digits[:-3], digits[-3:]
    if head:
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        groups.insert(0, head)
        tail = ",".join([*groups, tail])
    return f"₹{tail}.{rem:02d}"


def _fmt(text: str, values: dict) -> str:
    """str.format limited to plain {name} fields: anything else raises ValueError."""
    for _, field, spec, conv in Formatter().parse(text):
        if field is not None and (field not in values or spec or conv):
            raise ValueError("bad placeholder")
    out = text.format(**values)
    if not out.strip():
        raise ValueError("blank")
    return out


def _render(templates: list[NudgeTemplate], slug: str | None, t: Trigger):
    """(title, body) from the archetype's templates for this kind, else `default`'s.

    The variant is picked by fire date; a template that fails to format is logged
    (kind and archetype only) and the next one is tried.
    """
    for archetype in (slug, "default"):
        pool = [x for x in templates if x.archetype == archetype and x.kind == t.kind]
        if not pool:
            continue
        values = {"label": t.label, "count": t.count, "total": format_rupees(t.total)}
        start = t.fire_at.date().toordinal() % len(pool)
        for i in range(len(pool)):
            tpl = pool[(start + i) % len(pool)]
            try:
                return _fmt(tpl.title, values), _fmt(tpl.body, values)
            except (ValueError, KeyError, IndexError, AttributeError):
                logger.warning("skipping bad nudge template kind=%s archetype=%s", t.kind, archetype)
    return None


def build_plan(
    spends: list[Spend],
    archetype_slug: str | None,
    prefs: Nudges,
    now: datetime,
    templates: list[NudgeTemplate],
    subscriptions: Sequence[Subscription] = (),
    booklet: str | None = None,
) -> list[PlannedNudge]:
    ctx = NudgeContext(
        spends=[s for s in spends if s.category != "subscription"],
        now=now,
        today=now.date(),
        tz=now.tzinfo,
        booklet=booklet,
    )
    by_day: dict = {}
    for rule in RULES:
        if not getattr(prefs, rule.pref):
            continue
        for t in rule.evaluate(ctx):
            copy = _render(templates, archetype_slug, t)
            if copy is None:
                continue
            by_day[t.fire_at.date()] = PlannedNudge(
                id=f"{t.kind}:{t.key}:{t.fire_at.date()}",
                kind=t.kind, title=copy[0], body=copy[1], fire_at=t.fire_at,
            )  # fmt: skip

    plan = list(by_day.values())
    for sub in subscriptions:  # outside the daily cap and the toggles
        due = sub.next_billing_on
        if not sub.active or due is None:
            continue
        if not 0 <= (due - ctx.today).days < HORIZON_DAYS:
            continue
        fire = datetime.combine(due, time(SUBSCRIPTION_HOUR), tzinfo=ctx.tz)
        if fire <= now:
            continue
        plan.append(
            PlannedNudge(
                id=f"subscription:{sub.id}:{due}",
                kind="subscription",
                title=f"Is {sub.name} still active?",
                body="Tap to confirm this month's payment.",
                fire_at=fire,
            )
        )
    return sorted(plan, key=lambda n: n.fire_at)
