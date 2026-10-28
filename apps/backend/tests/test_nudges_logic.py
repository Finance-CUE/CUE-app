"""Spend-nudge planning rules.

Run: cd apps/backend && python -m pytest tests/test_nudges_logic.py -v
"""

from datetime import UTC, date, datetime, time, timedelta

import pytest

from app.features.assessment.archetypes import ARCHETYPES
from app.features.money.nudges import IST, TEMPLATES, _spend_hour, build_plan, format_rupees, group_key
from app.features.money.schemas import Nudges, Spend

ON = Nudges(pre_spend=True, patterns=True, weekly=True)
NOW = datetime(2026, 10, 28, 12, 0, tzinfo=IST)
TODAY = NOW.date()


def spend(desc="Zomato", cat="food", day=TODAY, paise=30000, hour=None, at=None, i=[0]):
    """A spend; `at` sets created_at, `hour` logs it that hour (IST) the same day, else a day later."""
    i[0] += 1
    if at is None:
        at = (
            datetime(day.year, day.month, day.day, hour, 5, tzinfo=IST)
            if hour is not None
            else datetime(day.year, day.month, day.day, 10, 0, tzinfo=IST) + timedelta(days=1)
        )
    return Spend(
        id=str(i[0]), description=desc, amount_paise=paise, category=cat,
        spent_on=day, created_at=at,
    )  # fmt: skip


def days_ago(n):
    return TODAY - timedelta(days=n)


def recent(anchor=NOW, desc="Zomato", cat="food", paise=30000, n=3):
    """n spends on the n days up to anchor's date, all logged just before `anchor` (latest = anchor)."""
    return [
        spend(desc, cat, anchor.date() - timedelta(days=d), paise, at=anchor - timedelta(minutes=d))
        for d in range(n)
    ]


def _habit(hours, days=(8, 15, 22)):
    return [spend(day=days_ago(d), hour=h) for d, h in zip(days, hours, strict=False)]


def test_merchant_match_is_case_insensitive_whole_word():
    assert group_key(spend("ZOMATO order #42", "other")) == ("zomato", "Zomato")
    assert group_key(spend("Blue Tokai latte", "other")) == ("blue_tokai", "Blue Tokai")
    assert group_key(spend("Ola ride home", "other")) == ("ola", "Ola")


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
    plan = build_plan(three, None, ON, NOW)
    assert [n.kind for n in plan] == ["pattern"]
    assert build_plan(three[:2], None, ON, NOW) == []
    old = three[:2] + [spend(day=days_ago(7), at=NOW)]  # 7 days ago is outside today-inclusive window
    assert build_plan(old, None, ON, NOW) == []


def test_pattern_picks_highest_total():
    cheap = recent(desc="Zomato", paise=100)
    dear = recent(desc="Amazon", cat="shopping", paise=90000)
    plan = build_plan(cheap + dear, None, ON, NOW)
    assert len(plan) == 1 and plan[0].id.startswith("pattern:amazon:")


def test_pattern_fires_15_min_after_latest_spend():
    plan = build_plan(recent(NOW - timedelta(minutes=5)), None, ON, NOW)
    assert plan[0].fire_at == NOW + timedelta(minutes=10)


def test_pattern_plan_is_stable_across_refetches_before_it_fires():
    spends = recent(NOW)
    a = build_plan(spends, None, ON, NOW)
    b = build_plan(spends, None, ON, NOW + timedelta(minutes=10))
    assert a == b and a[0].fire_at == NOW + timedelta(minutes=15)


@pytest.mark.parametrize("ago", [15, 20, 60 * 24])
def test_no_pattern_once_its_moment_has_passed(ago):
    assert build_plan(recent(NOW - timedelta(minutes=ago)), None, ON, NOW) == []


@pytest.mark.parametrize(
    ("anchor", "expected"),
    [
        (datetime(2026, 10, 28, 21, 50, tzinfo=IST), datetime(2026, 10, 29, 8, 0, tzinfo=IST)),
        (datetime(2026, 10, 28, 23, 50, tzinfo=IST), datetime(2026, 10, 29, 8, 0, tzinfo=IST)),
        (datetime(2026, 10, 28, 3, 0, tzinfo=IST), datetime(2026, 10, 28, 8, 0, tzinfo=IST)),
    ],
)
def test_pattern_anchored_in_quiet_hours_moves_to_8am(anchor, expected):
    plan = build_plan(recent(anchor), None, ON, anchor + timedelta(minutes=1))
    assert plan[0].fire_at == expected
    assert plan[0].id.endswith(str(expected.date()))


def test_pattern_pushed_to_8am_replaces_that_days_pre_spend():
    now = datetime(2026, 10, 28, 21, 55, tzinfo=IST)
    spends = _habit([19, 19, 19]) + recent(now - timedelta(minutes=5), "Amazon", "shopping")
    plan = build_plan(spends, None, ON, now)
    assert plan[0].kind == "pattern"
    assert plan[0].fire_at == datetime(2026, 10, 29, 8, 0, tzinfo=IST)
    assert [n.kind for n in plan[1:]] == ["pre_spend"] * 5
    assert plan[1].fire_at == datetime(2026, 10, 30, 18, 45, tzinfo=IST)


def test_hour_only_when_logged_same_ist_day():
    assert _spend_hour(spend(hour=19)) == 19
    assert _spend_hour(spend()) is None  # logged the next day
    # 20:00 UTC on the 27th is 01:30 IST on the 28th: not the same IST day as spent_on
    late = spend(day=date(2026, 10, 27), at=datetime(2026, 10, 27, 20, 0, tzinfo=UTC))
    assert _spend_hour(late) is None
    # 19:00 UTC on the 27th is 00:30 IST on the 28th; spent_on the 28th is same-day, hour 0
    early = spend(day=date(2026, 10, 28), at=datetime(2026, 10, 27, 19, 0, tzinfo=UTC))
    assert _spend_hour(early) == 0


def test_naive_created_at_is_treated_as_utc():
    assert _spend_hour(spend(day=date(2026, 10, 28), at=datetime(2026, 10, 27, 19, 0))) == 0
    # pattern anchor: naive 06:30 is UTC, i.e. 12:00 IST, so it fires 12:15 IST
    naive = [s.model_copy(update={"created_at": datetime(2026, 10, 28, 6, 30)}) for s in recent()]
    assert build_plan(naive, None, ON, NOW)[0].fire_at == NOW + timedelta(minutes=15)


def test_pre_spend_needs_three_distinct_days_at_same_hour():
    assert build_plan(_habit([19, 19]), None, ON, NOW) == []
    assert build_plan(_habit([19, 19, 20]), None, ON, NOW) == []
    two_same_day = _habit([19, 19]) + [spend(day=days_ago(8), hour=19)]
    assert build_plan(two_same_day, None, ON, NOW) == []


def test_pre_spend_history_is_28_days_inclusive():
    assert build_plan(_habit([19, 19, 19], days=(1, 2, 27)), None, ON, NOW)
    assert build_plan(_habit([19, 19, 19], days=(1, 2, 28)), None, ON, NOW) == []


def test_pre_spend_schedules_15_min_before_for_next_7_days():
    plan = build_plan(_habit([19, 19, 19]), None, ON, NOW)
    assert [n.kind for n in plan] == ["pre_spend"] * 7
    assert plan[0].fire_at == datetime(2026, 10, 28, 18, 45, tzinfo=IST)
    assert plan[-1].fire_at == datetime(2026, 11, 3, 18, 45, tzinfo=IST)


def test_pre_spend_skips_past_days():
    late = datetime(2026, 10, 28, 18, 50, tzinfo=IST)
    plan = build_plan(_habit([19, 19, 19]), None, ON, late)
    assert plan[0].fire_at.date() == date(2026, 10, 29) and len(plan) == 6


def test_pre_spend_skips_quiet_hours():
    assert build_plan(_habit([22, 22, 22]), None, ON, NOW)[0].fire_at.hour == 21
    assert build_plan(_habit([8, 8, 8]), None, ON, NOW) == []  # 07:45 is quiet
    assert build_plan(_habit([2, 2, 2]), None, ON, NOW) == []
    assert build_plan(_habit([0, 0, 0]), None, ON, NOW) == []  # lead is 23:45 the day before: quiet


@pytest.mark.parametrize("top_hour", [0, 8, 23])
def test_pre_spend_quiet_top_habit_falls_back_to_schedulable_one(top_hour):
    top = _habit([top_hour] * 4, days=(8, 9, 15, 22))
    other = _habit([19, 19, 19], days=(10, 16, 23))
    plan = build_plan(top + other, None, ON, NOW)
    assert plan and {n.fire_at.time() for n in plan} == {time(18, 45)}


def test_max_one_per_day_pattern_beats_pre_spend():
    spends = [spend(day=days_ago(d), hour=18) for d in (1, 2, 3)] + [spend(at=NOW), spend(at=NOW)]
    plan = build_plan(spends, None, ON, NOW)
    # pattern fires 12:15 today; the 17:45 pre-spend that day is dropped
    assert plan[0].kind == "pattern" and plan[0].fire_at == NOW + timedelta(minutes=15)
    days = [n.fire_at.date() for n in plan]
    assert len(days) == len(set(days)) == 7
    assert [n.kind for n in plan].count("pattern") == 1


def test_toggles_off_drop_that_kind():
    spends = [spend(day=days_ago(d), hour=18) for d in (1, 2, 3)] + [spend(at=NOW), spend(at=NOW)]
    no_pattern = build_plan(spends, None, Nudges(pre_spend=True, patterns=False, weekly=True), NOW)
    no_pre = build_plan(spends, None, Nudges(pre_spend=False, patterns=True, weekly=True), NOW)
    assert {n.kind for n in no_pattern} == {"pre_spend"}
    assert [n.kind for n in no_pre] == ["pattern"]
    assert build_plan(spends, None, Nudges(pre_spend=False, patterns=False, weekly=True), NOW) == []


def test_format_rupees_indian_grouping():
    assert format_rupees(12_400_000) == "₹1,24,000"
    assert format_rupees(99_900) == "₹999"
    assert format_rupees(100_000) == "₹1,000"
    assert format_rupees(10_000_000_000) == "₹10,00,00,000"
    assert format_rupees(0) == "₹0"


def test_format_rupees_rounds_half_up():
    assert format_rupees(89_997) == "₹900"
    assert format_rupees(89_950) == "₹900"
    assert format_rupees(89_949) == "₹899"
    assert format_rupees(99_999_950) == "₹10,00,000"


def test_every_archetype_has_templates_that_fit():
    slugs = [a.slug for a in ARCHETYPES] + ["default"]
    for slug in slugs:
        for kind in ("pattern", "pre_spend"):
            assert len(TEMPLATES[slug][kind]) == 2, (slug, kind)
    assert set(TEMPLATES) == set(slugs)
    big = 10_000_000_000
    for desc, cat in (("Blue Tokai", "food"), ("Chai", "food"), ("Shoes", "shopping"), ("Bowling", "fun")):
        for offset in (0, 1):  # both variants
            now = NOW + timedelta(days=offset)
            worst = recent(now, desc, cat, big) + [
                spend(desc, cat, now.date() - timedelta(days=d), big, hour=19) for d in (1, 2, 3)
            ]
            for slug in slugs:
                plans = build_plan(worst, slug, ON, now)
                assert {n.kind for n in plans} == {"pattern", "pre_spend"}
                for n in plans:
                    assert len(n.title) <= 40 and len(n.body) <= 120, (slug, n.title, n.body)
                    assert "{" not in n.title + n.body


def test_variant_is_deterministic_and_ids_stable():
    spends = recent()
    a = build_plan(spends, "optimizer", ON, NOW)
    b = build_plan(spends, "optimizer", ON, NOW + timedelta(minutes=10))
    assert a[0].title == b[0].title and a[0].body == b[0].body
    assert a[0].id == "pattern:zomato:2026-10-28"
    h = build_plan(_habit([19, 19, 19]), None, ON, NOW)
    assert h[1].id == "pre_spend:zomato:2026-10-29"
    assert len({n.title for n in h[:2]}) == 2  # consecutive days alternate variants
