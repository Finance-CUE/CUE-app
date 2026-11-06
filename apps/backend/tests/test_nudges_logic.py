"""Spend-nudge planning rules.

Run: cd apps/backend && python -m pytest tests/test_nudges_logic.py -v
"""

import logging
import re
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from app.features.assessment.archetypes import ARCHETYPES
from app.features.money import nudges
from app.features.money.nudges import _fmt, _spend_hour, build_plan, format_rupees, group_key
from app.features.money.schemas import NudgeTemplate, Nudges, Spend

IST = ZoneInfo("Asia/Kolkata")
NY = ZoneInfo("America/New_York")

ON = Nudges(pre_spend=True, patterns=True, weekly=False)
ALL = Nudges(pre_spend=True, patterns=True, weekly=True)
OFF = Nudges(pre_spend=False, patterns=False, weekly=False)
NOW = datetime(2026, 10, 28, 12, 0, tzinfo=IST)  # a Wednesday
TODAY = NOW.date()
SUNDAY = datetime(2026, 11, 1, 12, 0, tzinfo=IST)

SEED = Path(__file__).parents[1] / "sql" / "007_notification_templates.sql"
_ROW = re.compile(r"^\s*\('(\w+)', '(\w+)', '((?:[^']|'')*)', '((?:[^']|'')*)'\),?$", re.M)
SEED_ROWS = [(a, k, t.replace("''", "'"), b.replace("''", "'")) for a, k, t, b in _ROW.findall(SEED.read_text("utf-8"))]
SLUGS = [a.slug for a in ARCHETYPES] + ["default"]
TEMPLATES = [NudgeTemplate(archetype=a, kind=k, title=t, body=b) for a, k, t, b in SEED_ROWS]


def plan(spends, slug=None, prefs=ON, now=NOW, templates=None, **kw):
    return build_plan(spends, slug, prefs, now, TEMPLATES if templates is None else templates, **kw)


def tpl(kind, title="t", body="b", archetype="default"):
    return NudgeTemplate(archetype=archetype, kind=kind, title=title, body=body)


def spend(desc="Zomato", cat="food", day=TODAY, paise=30000, hour=None, at=None, tz=IST, i=[0]):
    """A spend; `at` sets created_at, `hour` logs it that hour (tz) the same day, else a day later."""
    i[0] += 1
    if at is None:
        at = (
            datetime(day.year, day.month, day.day, hour, 5, tzinfo=tz)
            if hour is not None
            else datetime(day.year, day.month, day.day, 10, 0, tzinfo=tz) + timedelta(days=1)
        )
    return Spend(
        id=str(i[0]), description=desc, amount_paise=paise, category=cat,
        spent_on=day, created_at=at,
    )  # fmt: skip


def days_ago(n, today=TODAY):
    return today - timedelta(days=n)


def recent(anchor=NOW, desc="Zomato", cat="food", paise=30000, n=3):
    """n spends on the n days up to anchor's date, all logged just before `anchor` (latest = anchor)."""
    return [
        spend(desc, cat, anchor.date() - timedelta(days=d), paise, at=anchor - timedelta(minutes=d))
        for d in range(n)
    ]


def _habit(hours, days=(8, 15, 22)):
    return [spend(day=days_ago(d), hour=h) for d, h in zip(days, hours, strict=False)]


def test_no_ist_or_templates_constants_left():
    assert not hasattr(nudges, "IST") and not hasattr(nudges, "TEMPLATES")


def test_merchant_match_is_case_insensitive_whole_word():
    assert group_key(spend("ZOMATO order #42", "other")) == ("zomato", "Zomato")
    assert group_key(spend("Blue Tokai latte", "other")) == ("blue_tokai", "Blue Tokai")
    assert group_key(spend("Ola ride home", "other")) == ("ola", "Ola")


def test_swiggy_instamart_groups_as_instamart():
    assert group_key(spend("Swiggy Instamart order", "groceries")) == ("instamart", "Instamart")
    assert group_key(spend("Swiggy dinner", "food")) == ("swiggy", "Swiggy")


@pytest.mark.parametrize("desc", ["Chocolate", "Granola", "Coca-Cola", "tuber", "Potato tuber"])
def test_merchant_keyword_inside_a_word_does_not_match(desc):
    assert group_key(spend(desc, "other")) is None


def test_non_discretionary_without_merchant_is_ignored():
    assert group_key(spend("Electricity", "bills")) is None
    assert group_key(spend("Auto", "transport")) is None


def test_category_labels_read_naturally_mid_sentence():
    assert group_key(spend("Chai", "food")) == ("food", "food orders")
    assert group_key(spend("Shoes", "shopping")) == ("shopping", "shopping")
    assert group_key(spend("Bowling", "fun")) == ("fun", "going out")


def test_pattern_triggers_at_three_in_seven_days_not_two():
    three = [spend(day=days_ago(d), at=NOW) for d in (0, 2, 6)]
    assert [n.kind for n in plan(three)] == ["pattern"]
    assert plan(three[:2]) == []
    old = three[:2] + [spend(day=days_ago(7), at=NOW)]  # 7 days ago is outside today-inclusive window
    assert plan(old) == []


def test_pattern_picks_highest_total():
    cheap = recent(desc="Zomato", paise=100)
    dear = recent(desc="Amazon", cat="shopping", paise=90000)
    p = plan(cheap + dear)
    assert len(p) == 1 and p[0].id.startswith("pattern:amazon:")


def test_pattern_fires_15_min_after_latest_spend():
    p = plan(recent(NOW - timedelta(minutes=5)))
    assert p[0].fire_at == NOW + timedelta(minutes=10)


def test_pattern_plan_is_stable_across_refetches_before_it_fires():
    spends = recent(NOW)
    a = plan(spends)
    b = plan(spends, now=NOW + timedelta(minutes=10))
    assert a == b and a[0].fire_at == NOW + timedelta(minutes=15)


@pytest.mark.parametrize("ago", [15, 20, 60 * 24])
def test_no_pattern_once_its_moment_has_passed(ago):
    assert plan(recent(NOW - timedelta(minutes=ago))) == []


@pytest.mark.parametrize(
    ("anchor", "expected"),
    [
        (datetime(2026, 10, 28, 21, 50, tzinfo=IST), datetime(2026, 10, 29, 8, 0, tzinfo=IST)),
        (datetime(2026, 10, 28, 23, 50, tzinfo=IST), datetime(2026, 10, 29, 8, 0, tzinfo=IST)),
        (datetime(2026, 10, 28, 3, 0, tzinfo=IST), datetime(2026, 10, 28, 8, 0, tzinfo=IST)),
    ],
)
def test_pattern_anchored_in_quiet_hours_moves_to_8am(anchor, expected):
    p = plan(recent(anchor), now=anchor + timedelta(minutes=1))
    assert p[0].fire_at == expected
    assert p[0].id.endswith(str(expected.date()))


def test_pattern_pushed_to_8am_replaces_that_days_pre_spend():
    now = datetime(2026, 10, 28, 21, 55, tzinfo=IST)
    # small amounts keep this from also being a spike
    p = plan(_habit([19, 19, 19]) + recent(now - timedelta(minutes=5), "Amazon", "shopping", 10000), now=now)
    assert p[0].kind == "pattern"
    assert p[0].fire_at == datetime(2026, 10, 29, 8, 0, tzinfo=IST)
    assert [n.kind for n in p[1:]] == ["pre_spend"] * 5
    assert p[1].fire_at == datetime(2026, 10, 30, 18, 45, tzinfo=IST)


def test_hour_only_when_logged_same_local_day():
    assert _spend_hour(spend(hour=19), IST) == 19
    assert _spend_hour(spend(), IST) is None  # logged the next day
    # 20:00 UTC on the 27th is 01:30 IST on the 28th: not the same IST day as spent_on
    late = spend(day=date(2026, 10, 27), at=datetime(2026, 10, 27, 20, 0, tzinfo=UTC))
    assert _spend_hour(late, IST) is None
    # 19:00 UTC on the 27th is 00:30 IST on the 28th; spent_on the 28th is same-day, hour 0
    early = spend(day=date(2026, 10, 28), at=datetime(2026, 10, 27, 19, 0, tzinfo=UTC))
    assert _spend_hour(early, IST) == 0


def test_naive_created_at_is_treated_as_utc():
    assert _spend_hour(spend(day=date(2026, 10, 28), at=datetime(2026, 10, 27, 19, 0)), IST) == 0
    # pattern anchor: naive 06:30 is UTC, i.e. 12:00 IST, so it fires 12:15 IST
    naive = [s.model_copy(update={"created_at": datetime(2026, 10, 28, 6, 30)}) for s in recent()]
    assert plan(naive)[0].fire_at == NOW + timedelta(minutes=15)


def test_pre_spend_needs_three_distinct_days_at_same_hour():
    assert plan(_habit([19, 19])) == []
    assert plan(_habit([19, 19, 20])) == []
    two_same_day = _habit([19, 19]) + [spend(day=days_ago(8), hour=19)]
    assert plan(two_same_day) == []


def test_pre_spend_history_is_28_days_inclusive():
    assert plan(_habit([19, 19, 19], days=(1, 2, 27)))
    assert plan(_habit([19, 19, 19], days=(1, 2, 28))) == []


def test_pre_spend_schedules_15_min_before_for_next_7_days():
    p = plan(_habit([19, 19, 19]))
    assert [n.kind for n in p] == ["pre_spend"] * 7
    assert p[0].fire_at == datetime(2026, 10, 28, 18, 45, tzinfo=IST)
    assert p[-1].fire_at == datetime(2026, 11, 3, 18, 45, tzinfo=IST)


def test_pre_spend_skips_past_days():
    late = datetime(2026, 10, 28, 18, 50, tzinfo=IST)
    p = plan(_habit([19, 19, 19]), now=late)
    assert p[0].fire_at.date() == date(2026, 10, 29) and len(p) == 6


def test_pre_spend_skips_quiet_hours():
    assert plan(_habit([22, 22, 22]))[0].fire_at.hour == 21
    assert plan(_habit([8, 8, 8])) == []  # 07:45 is quiet
    assert plan(_habit([2, 2, 2])) == []
    assert plan(_habit([0, 0, 0])) == []  # lead is 23:45 the day before: quiet


@pytest.mark.parametrize("top_hour", [0, 8, 23])
def test_pre_spend_quiet_top_habit_falls_back_to_schedulable_one(top_hour):
    top = _habit([top_hour] * 4, days=(8, 9, 15, 22))
    other = _habit([19, 19, 19], days=(10, 16, 23))
    p = plan(top + other)
    assert p and {n.fire_at.time() for n in p} == {time(18, 45)}


def test_max_one_per_day_pattern_beats_pre_spend():
    spends = [spend(day=days_ago(d), hour=18) for d in (1, 2, 3)] + [spend(at=NOW), spend(at=NOW)]
    p = plan(spends)
    # pattern fires 12:15 today; the 17:45 pre-spend that day is dropped
    assert p[0].kind == "pattern" and p[0].fire_at == NOW + timedelta(minutes=15)
    days = [n.fire_at.date() for n in p]
    assert len(days) == len(set(days)) == 7
    assert [n.kind for n in p].count("pattern") == 1


def test_toggles_off_drop_that_kind():
    spends = [spend(day=days_ago(d), hour=18) for d in (1, 2, 3)] + [spend(at=NOW), spend(at=NOW)]
    no_pattern = plan(spends, prefs=Nudges(pre_spend=True, patterns=False, weekly=False))
    no_pre = plan(spends, prefs=Nudges(pre_spend=False, patterns=True, weekly=False))
    assert {n.kind for n in no_pattern} == {"pre_spend"}
    assert [n.kind for n in no_pre] == ["pattern"]
    assert plan(spends, prefs=OFF) == []


# --- spike -----------------------------------------------------------------


def _spike_spends(prior, now_amount, prior_day=20, anchor=NOW - timedelta(minutes=5)):
    """One old 'Rent' spend of `prior` paise and one recent one; neither groups as a pattern."""
    return [
        spend("Rent", "bills", days_ago(prior_day), prior, at=NOW - timedelta(days=prior_day)),
        spend("Rent", "bills", TODAY, now_amount, at=anchor),
    ]


def test_spike_fires_at_exactly_1_5x_the_weekly_average():
    # prior 21 days total 200000 -> weekly average 66666.67; 1.5x is 100000
    p = plan(_spike_spends(200_000, 100_000))
    assert [n.kind for n in p] == ["spike"]
    assert p[0].id == "spike:spending:2026-10-28"
    assert p[0].fire_at == NOW + timedelta(minutes=10)
    assert plan(_spike_spends(200_000, 99_999)) == []


def test_spike_needs_50000_paise():
    assert [n.kind for n in plan(_spike_spends(10_000, 50_000))] == ["spike"]
    assert plan(_spike_spends(10_000, 49_999)) == []


def test_spike_needs_prior_spending():
    # the only old spend is outside the 21 day baseline window
    assert plan(_spike_spends(100_000, 100_000, prior_day=30)) == []


@pytest.mark.parametrize(("prior_day", "fires"), [(14, True), (13, False)])
def test_spike_needs_history_at_least_14_days_old(prior_day, fires):
    assert bool(plan(_spike_spends(100_000, 100_000, prior_day=prior_day))) is fires


def test_spike_window_is_the_last_7_days_inclusive():
    old = [spend("Rent", "bills", days_ago(20), 100_000, at=NOW - timedelta(days=20))]
    edge = spend("Rent", "bills", days_ago(6), 100_000, at=NOW - timedelta(minutes=5))
    gone = spend("Rent", "bills", days_ago(7), 100_000, at=NOW - timedelta(minutes=5))
    assert [n.kind for n in plan(old + [edge])] == ["spike"]
    assert plan(old + [gone]) == []


def test_spike_moves_out_of_quiet_hours_and_never_refires():
    anchor = datetime(2026, 10, 28, 23, 50, tzinfo=IST)
    p = plan(_spike_spends(200_000, 100_000, anchor=anchor), now=anchor + timedelta(minutes=1))
    assert p[0].fire_at == datetime(2026, 10, 29, 8, 0, tzinfo=IST)
    assert plan(_spike_spends(200_000, 100_000, anchor=NOW - timedelta(minutes=20))) == []


def test_spike_follows_the_patterns_toggle():
    spends = _spike_spends(200_000, 100_000)
    assert plan(spends, prefs=Nudges(pre_spend=True, patterns=False, weekly=False)) == []


# --- weekly ----------------------------------------------------------------


def test_weekly_fires_next_sunday_18_with_week_to_date_totals():
    spends = [spend("Tea", "bills", d, 25_000, at=NOW) for d in (days_ago(2), TODAY)]
    spends.append(spend("Tea", "bills", days_ago(3), 99_000, at=NOW))  # Sunday of the previous week
    p = plan(spends, prefs=ALL, templates=[tpl("weekly", "wk", "{count}|{total}|{label}")])
    assert [(n.kind, n.id, n.fire_at) for n in p] == [
        ("weekly", "weekly:week:2026-11-01", datetime(2026, 11, 1, 18, 0, tzinfo=IST))
    ]
    assert p[0].body == "2|₹500.00|this week"


def test_weekly_needs_at_least_one_spend_this_week():
    assert plan([spend("Tea", "bills", days_ago(3), 1000, at=NOW)], prefs=ALL) == []
    assert plan([], prefs=ALL) == []


def test_weekly_today_if_sunday_and_still_ahead():
    s = [spend("Tea", "bills", SUNDAY.date(), 1000, at=SUNDAY)]
    assert [n.fire_at for n in plan(s, prefs=ALL, now=SUNDAY)] == [datetime(2026, 11, 1, 18, 0, tzinfo=IST)]
    after = SUNDAY.replace(hour=18)
    assert plan(s, prefs=ALL, now=after) == []  # next Sunday is outside the 7 day horizon


def test_weekly_follows_its_toggle():
    s = [spend("Tea", "bills", TODAY, 1000, at=NOW)]
    assert plan(s, prefs=ON) == []


# --- daily cap priority ----------------------------------------------------


def _sunday_spends():
    now = SUNDAY
    habit = [spend(day=days_ago(d, now.date()), hour=17) for d in (8, 15, 22)]
    old = spend("Rent", "bills", days_ago(20, now.date()), 50_000, at=now - timedelta(days=20))
    return habit + [old] + recent(now - timedelta(minutes=5))


def test_daily_cap_weekly_beats_spike_pattern_and_pre_spend():
    p = plan(_sunday_spends(), prefs=ALL, now=SUNDAY)
    sunday = [n for n in p if n.fire_at.date() == SUNDAY.date()]
    assert [n.kind for n in sunday] == ["weekly"]
    assert len({n.fire_at.date() for n in p}) == len(p)


def test_daily_cap_spike_beats_pattern_and_pre_spend():
    p = plan(_sunday_spends(), prefs=ON, now=SUNDAY)
    sunday = [n for n in p if n.fire_at.date() == SUNDAY.date()]
    assert [n.kind for n in sunday] == ["spike"]  # the pattern and the 16:45 pre-spend lose


# --- subscriptions ---------------------------------------------------------


def test_subscription_spends_are_excluded_from_every_rule():
    assert plan(recent(NOW, "Zomato", "subscription")) == []
    habit = [s.model_copy(update={"category": "subscription"}) for s in _habit([19, 19, 19])]
    assert plan(habit) == []
    big = _spike_spends(200_000, 100_000)
    assert plan([s.model_copy(update={"category": "subscription"}) for s in big], prefs=ALL) == []


def sub(due, active=True, id="s1", name="Netflix"):
    return SimpleNamespace(id=id, name=name, active=active, next_billing_on=due)


def test_subscription_nudge_at_10_local_on_billing_day():
    p = plan([], subscriptions=[sub(TODAY + timedelta(days=2))], prefs=OFF)
    assert len(p) == 1
    assert (p[0].id, p[0].kind) == ("subscription:s1:2026-10-30", "subscription")
    assert p[0].fire_at == datetime(2026, 10, 30, 10, 0, tzinfo=IST)
    assert p[0].title == "Is Netflix still active?"
    assert p[0].body == "Tap to confirm this month's payment."


def test_subscription_nudge_is_outside_the_daily_cap_and_toggles():
    day = TODAY + timedelta(days=1)
    p = plan(_habit([10, 10, 10]), subscriptions=[sub(day)])  # a pre_spend 09:45 that day too
    assert sorted(n.kind for n in p if n.fire_at.date() == day) == ["pre_spend", "subscription"]
    assert [n.kind for n in plan([], subscriptions=[sub(day)], prefs=OFF)] == ["subscription"]


@pytest.mark.parametrize(
    ("due", "active", "now", "expected"),
    [
        (TODAY, False, NOW.replace(hour=9), 0),  # inactive
        (None, True, NOW, 0),
        (TODAY, True, NOW, 0),  # 10:00 already passed
        (TODAY, True, NOW.replace(hour=10), 0),  # exactly 10:00 is not ahead
        (TODAY, True, NOW.replace(hour=9), 1),
        (TODAY + timedelta(days=6), True, NOW, 1),
        (TODAY + timedelta(days=7), True, NOW, 0),  # outside the horizon
    ],
)
def test_subscription_nudge_conditions(due, active, now, expected):
    assert len(plan([], subscriptions=[sub(due, active)], now=now, prefs=OFF)) == expected


# --- zones -----------------------------------------------------------------


def test_hour_follows_the_users_zone():
    s = spend(day=date(2026, 10, 27), at=datetime(2026, 10, 27, 23, 30, tzinfo=UTC))
    assert _spend_hour(s, NY) == 19  # 19:30 EDT
    assert _spend_hour(s, IST) is None  # 05:00 IST next day


def test_pre_spend_wall_clock_holds_across_a_dst_change():
    now = datetime(2026, 10, 30, 12, 0, tzinfo=NY)  # US clocks go back on Nov 1
    habit = [spend(day=days_ago(d, now.date()), hour=19, tz=NY) for d in (8, 15, 22)]
    p = plan(habit, now=now)
    assert [n.kind for n in p] == ["pre_spend"] * 7
    assert {(n.fire_at.hour, n.fire_at.minute) for n in p} == {(18, 45)}
    assert {n.fire_at.utcoffset() for n in p} == {timedelta(hours=-4), timedelta(hours=-5)}


def test_quiet_hours_follow_local_time_not_ist():
    # 06:45 local is quiet in New York even though it is midday in India
    now = datetime(2026, 10, 30, 12, 0, tzinfo=NY)
    assert plan([spend(day=days_ago(d, now.date()), hour=7, tz=NY) for d in (8, 15, 22)], now=now) == []
    anchor = datetime(2026, 10, 31, 21, 50, tzinfo=NY)
    p = plan(recent(anchor), now=anchor + timedelta(minutes=1))
    assert p[0].fire_at == datetime(2026, 11, 1, 8, 0, tzinfo=NY)
    assert p[0].fire_at.utcoffset() == timedelta(hours=-5)


# --- templates -------------------------------------------------------------


def test_bad_templates_are_skipped_and_logged_without_the_copy(caplog):
    bad = ["{foo}", "stray { brace", "close } brace", "{label!r}", "{label:>5}", "{0}", "{}"]
    good = tpl("pattern", "ok", "fine {label}")
    for body in bad:
        bad_tpl = tpl("pattern", "t", body + " SECRET-COPY")
        assert plan(recent(), templates=[bad_tpl, good])[0].body == "fine Zomato", body
        caplog.clear()
        with caplog.at_level(logging.WARNING):
            assert plan(recent(), templates=[bad_tpl]) == []
        assert "kind=pattern" in caplog.text and "archetype=default" in caplog.text
        assert "SECRET-COPY" not in caplog.text and "Zomato" not in caplog.text


@pytest.mark.parametrize(("title", "body"), [("  ", "ok"), ("ok", ""), ("ok", " 	 ")])
def test_blank_title_or_body_is_unusable(title, body):
    blank = tpl("pattern", title, body)
    assert plan(recent(), templates=[blank]) == []
    assert plan(recent(), templates=[blank, tpl("pattern", "ok", "fine")])[0].body == "fine"


def test_only_bad_templates_means_no_nudge_not_an_error():
    assert plan(recent(), templates=[tpl("pattern", "{foo}", "b")]) == []


def test_empty_templates_give_no_nudges():
    assert plan(recent() + _habit([19, 19, 19]), prefs=ALL, templates=[]) == []
    assert plan([], templates=[], subscriptions=[sub(TODAY + timedelta(days=1))])[0].kind == "subscription"


def test_missing_kind_falls_back_to_default_per_kind():
    templates = [
        tpl("pattern", "own", "own pattern", archetype="optimizer"),
        tpl("pattern", "dflt", "default pattern"),
        tpl("pre_spend", "dflt", "default pre"),
    ]
    spends = recent() + _habit([19, 19, 19])
    by_kind = {n.kind: n for n in plan(spends, slug="optimizer", templates=templates)}
    assert by_kind["pattern"].title == "own"
    assert by_kind["pre_spend"].title == "dflt"
    assert plan(recent(), slug="unknown_slug", templates=templates)[0].title == "dflt"


def test_variant_is_deterministic_and_ids_stable():
    spends = recent()
    a = plan(spends, "optimizer")
    b = plan(spends, "optimizer", now=NOW + timedelta(minutes=10))
    assert a[0].title == b[0].title and a[0].body == b[0].body
    assert a[0].id == "pattern:zomato:2026-10-28"
    h = plan(_habit([19, 19, 19]))
    assert h[1].id == "pre_spend:zomato:2026-10-29"
    assert len({n.title for n in h[:2]}) == 2  # consecutive days alternate variants


def test_format_rupees_two_decimals_and_indian_grouping():
    assert format_rupees(12_400_000) == "₹1,24,000.00"
    assert format_rupees(99_900) == "₹999.00"
    assert format_rupees(100_000) == "₹1,000.00"
    assert format_rupees(10_000_000_000) == "₹10,00,00,000.00"
    assert format_rupees(0) == "₹0.00"
    assert format_rupees(5) == "₹0.05"
    assert format_rupees(89_997) == "₹899.97"


# --- seed SQL --------------------------------------------------------------


def test_seed_has_ten_rows_per_slug_split_3_3_2_2():
    assert set(SLUGS) == {a for a, *_ in SEED_ROWS} and len(SLUGS) == 11
    for slug in SLUGS:
        kinds = [k for a, k, *_ in SEED_ROWS if a == slug]
        assert len(kinds) == 10, slug
        assert {k: kinds.count(k) for k in set(kinds)} == {"pattern": 3, "pre_spend": 3, "spike": 2, "weekly": 2}, slug


def test_seed_copy_limits_and_placeholders():
    for slug, kind, title, body in SEED_ROWS:
        assert title.startswith("[PLACEHOLDER] "), (slug, title)
        assert len(title) <= 40 and len(body) <= 120, (slug, title, body)
        for text in (title, body):
            assert not re.search(r"[{}]", re.sub(r"\{(label|count|total)\}", "", text)), (slug, text)


def test_seed_copy_renders_within_limits_at_worst_case():
    values = {"label": "Blue Tokai", "count": 99, "total": format_rupees(10_000_000_000)}
    for slug, kind, title, body in SEED_ROWS:
        assert len(_fmt(title, values)) <= 40 and len(_fmt(body, values)) <= 120, (slug, title, body)
        if kind == "weekly":
            assert "so far" in body.lower(), (slug, body)


def test_seed_is_idempotent_and_never_overwrites():
    sql = SEED.read_text("utf-8")
    assert "where not exists" in sql and "on conflict" not in sql.replace("do nothing", "")
    assert not re.search(r"\bupdate\b\s+public\.notification_templates", sql, re.I)
    assert "revoke all on table public.notification_templates" in sql

