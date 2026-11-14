from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest
from pydantic import ValidationError

from app.features.money.schemas import (
    BalanceSnapshot,
    CycleAnswer,
    KhataCreate,
    Spend,
    SpendCreate,
    StartingMoney,
)
from app.features.money.service import (
    billing_date,
    build_trend,
    due_months,
    net_worth,
    next_billing_on,
)

IST = ZoneInfo("Asia/Kolkata")


def test_billing_day_31_clamps_in_february_and_returns_in_march():
    assert billing_date(date(2026, 1, 1), 31) == date(2026, 1, 31)
    assert billing_date(date(2026, 2, 1), 31) == date(2026, 2, 28)
    assert billing_date(date(2028, 2, 1), 31) == date(2028, 2, 29)
    assert billing_date(date(2026, 3, 1), 31) == date(2026, 3, 31)
    assert billing_date(date(2026, 4, 1), 31) == date(2026, 4, 30)


def test_next_billing_on_is_today_or_later():
    start, none = date(2020, 1, 1), set()
    assert next_billing_on(24, start, none, date(2026, 10, 24)) == date(2026, 10, 24)
    assert next_billing_on(5, start, none, date(2026, 10, 24)) == date(2026, 11, 5)
    assert next_billing_on(5, start, none, date(2026, 12, 24)) == date(2027, 1, 5)
    assert next_billing_on(31, start, none, date(2026, 2, 10)) == date(2026, 2, 28)
    assert next_billing_on(31, start, none, date(2026, 2, 28)) == date(2026, 2, 28)
    assert next_billing_on(31, start, none, date(2026, 3, 1)) == date(2026, 3, 31)  # no drift
    assert next_billing_on(31, start, none, date(2026, 1, 31)) == date(2026, 1, 31)


def test_next_billing_on_skips_answered_months():
    start = date(2026, 11, 6)
    # logged on 6 Nov with billing day 20: the Nov cycle is answered
    assert next_billing_on(20, start, {date(2026, 11, 1)}, date(2026, 11, 6)) == date(2026, 12, 20)
    # answered "yes" at 09:00 on the billing day itself
    assert next_billing_on(6, date(2026, 8, 1), {date(2026, 11, 1)}, date(2026, 11, 6)) == date(2026, 12, 6)
    # added today with billing day today: due_months excludes it, so next is next month
    assert next_billing_on(6, start, set(), start) == date(2026, 12, 6)
    # several answered months in a row
    got = next_billing_on(20, date(2026, 1, 1), {date(2026, 11, 1), date(2026, 12, 1)}, start)
    assert got == date(2027, 1, 20)


def test_due_months_includes_missed_months():
    got = due_months(10, date(2026, 7, 20), set(), date(2026, 11, 6))
    assert got == [date(2026, 8, 1), date(2026, 9, 1), date(2026, 10, 1)]


def test_due_months_starts_on_boundary_is_exclusive_and_today_inclusive():
    # billing date == starts_on is not due; billing date == today is.
    assert due_months(20, date(2026, 7, 20), set(), date(2026, 7, 31)) == []
    assert due_months(20, date(2026, 7, 20), set(), date(2026, 8, 20)) == [date(2026, 8, 1)]
    assert due_months(20, date(2026, 7, 20), set(), date(2026, 8, 19)) == []
    # starts before the billing day in its own month: that month is due.
    assert due_months(25, date(2026, 7, 20), set(), date(2026, 7, 25)) == [date(2026, 7, 1)]


def test_due_months_skips_answered_and_clamps():
    answered = {date(2026, 8, 1), date(2026, 10, 1)}
    assert due_months(10, date(2026, 7, 20), answered, date(2026, 11, 6)) == [date(2026, 9, 1)]
    assert due_months(31, date(2026, 1, 5), set(), date(2026, 3, 1)) == [
        date(2026, 1, 1),
        date(2026, 2, 1),
    ]  # Feb billing date is the 28th, on or before Mar 1


def test_net_worth_is_none_without_starting_money():
    assert net_worth(None, 0, 0) is None


def test_net_worth_ignores_spends_and_is_bank_cash_lent_borrowed():
    start = StartingMoney(bank_paise=50_000_00, cash_paise=2_000_00, set_at=datetime.now(UTC))
    assert net_worth(start, 3_000_00, 1_000_00) == 50_000_00 + 2_000_00 + 3_000_00 - 1_000_00


def _snap(day, hour, bank, cash=0):
    return BalanceSnapshot(
        bank_paise=bank, cash_paise=cash, recorded_at=datetime(2026, 10, day, hour, tzinfo=IST)
    )


def _spend(day, amount):
    return Spend(
        id=str(day), description="x", amount_paise=amount, category="food",
        spent_on=date(2026, 10, day), created_at=datetime(2026, 10, day, tzinfo=UTC),
    )  # fmt: skip


def test_trend_carries_balance_forward_and_none_before_first_snapshot():
    history = [_snap(3, 23, 1000, 50), _snap(5, 1, 2000), _snap(5, 9, 3000, 10)]
    spends = [_spend(4, 100), _spend(4, 25), _spend(6, 7)]
    pts = build_trend(history, spends, date(2026, 10, 2), date(2026, 10, 6), IST)
    assert [p.date for p in pts] == [date(2026, 10, d) for d in range(2, 7)]
    assert [p.balance_paise for p in pts] == [None, 1050, 1050, 3010, 3010]
    assert [p.spent_paise for p in pts] == [0, 0, 125, 0, 7]


def test_trend_buckets_snapshots_by_local_day():
    # 20:00 UTC on the 3rd is 01:30 IST on the 4th.
    snap = BalanceSnapshot(
        bank_paise=900, cash_paise=0, recorded_at=datetime(2026, 10, 3, 20, tzinfo=UTC)
    )
    pts = build_trend([snap], [], date(2026, 10, 3), date(2026, 10, 4), IST)
    assert [p.balance_paise for p in pts] == [None, 900]


def test_spend_accepts_iso_date_and_strips_description():
    spend = SpendCreate.model_validate(
        {
            "description": "  coffee ",
            "amount_paise": 21000,
            "category": "food",
            "spent_on": "2026-10-24",
        }
    )
    assert spend.description == "coffee" and spend.spent_on == date(2026, 10, 24)

@pytest.mark.parametrize("bad", [
    {"amount_paise": 0}, {"amount_paise": -5}, {"amount_paise": 10_000_000_001},
    {"amount_paise": 210.5}, {"amount_paise": "21000"}, {"description": "   "},
    {"description": "x" * 81}, {"category": "rent"}, {"spent_on": "24/10/2026"}, {"extra": 1},
])
def test_spend_rejects(bad):
    payload = {
        "description": "coffee",
        "amount_paise": 21000,
        "category": "food",
        "spent_on": "2026-10-24",
    }
    with pytest.raises(ValidationError):
        SpendCreate.model_validate({**payload, **bad})

def test_khata_blank_note_becomes_none():
    entry = KhataCreate.model_validate(
        {"direction": "lent", "person": "Riya", "amount_paise": 50000, "note": "  "}
    )
    assert entry.note is None

@pytest.mark.parametrize("bad", ["1999-12-01", "2101-01-01"])
def test_cycle_answer_month_is_bounded(bad):
    with pytest.raises(ValidationError):
        CycleAnswer.model_validate({"month": bad, "active": True})


@pytest.mark.parametrize("bad", ["1999-12-31", "2101-01-01"])
def test_spend_date_is_bounded(bad):
    with pytest.raises(ValidationError):
        SpendCreate.model_validate(
            {"description": "x", "amount_paise": 1, "category": "food", "spent_on": bad}
        )


def test_subscription_spend_description_is_limited_to_60_after_strip():
    base = {"amount_paise": 100, "category": "subscription", "spent_on": "2026-10-24",
            "billing_day": 5}  # fmt: skip
    assert SpendCreate.model_validate({**base, "description": " " + "x" * 60 + " "})
    with pytest.raises(ValidationError):
        SpendCreate.model_validate({**base, "description": "x" * 61})
    food = {**base, "category": "food", "description": "x" * 80}
    del food["billing_day"]
    assert SpendCreate.model_validate(food)


def test_cycle_answer_month_must_be_first_of_month():
    assert CycleAnswer.model_validate({"month": "2026-10-01", "active": True}).active is True
    for bad in [{"month": "2026-10-02", "active": True}, {"month": "2026-10-01", "active": 1}]:
        with pytest.raises(ValidationError):
            CycleAnswer.model_validate(bad)


@pytest.mark.parametrize("category,day,ok", [
    ("subscription", 5, True), ("subscription", None, False), ("subscription", 0, False),
    ("subscription", 32, False), ("food", None, True), ("food", 5, False),
])
def test_billing_day_required_for_subscription_and_forbidden_otherwise(category, day, ok):
    payload = {"description": "Netflix", "amount_paise": 100, "category": category,
               "spent_on": "2026-10-24"}  # fmt: skip
    if day is not None:
        payload["billing_day"] = day
    if ok:
        assert SpendCreate.model_validate(payload).billing_day == day
    else:
        with pytest.raises(ValidationError):
            SpendCreate.model_validate(payload)
