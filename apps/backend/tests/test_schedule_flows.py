"""Pure checks for scheduled due dates (schedule.py) and money in and out (flows.py).

Run: cd apps/backend && python -m pytest tests/test_schedule_flows.py -v
"""

from datetime import UTC, date, datetime, timedelta

from app.features.money import flows
from app.features.money.ledger import Account, Txn
from app.features.money.schedule import (
    Answer,
    Item,
    due_dates,
    first_due,
    next_due,
    occurrences,
)

T0 = datetime(2026, 1, 1, tzinfo=UTC)


def item(**kw) -> Item:
    base = dict(
        id="i1", name="Netflix", kind="subscription", frequency="monthly", amount_paise=199_00,
        billing_day=18, starts_on=date(2026, 11, 17), first_due_on=date(2026, 11, 18), active=True,
    )  # fmt: skip
    return Item(**{**base, **kw})


_seq = iter(range(1, 10_000))


def txn(type_, amount, on, account="a", category=None, **kw) -> Txn:
    n = next(_seq)
    return Txn(
        id=f"t{n}", type=type_, amount_paise=amount, occurred_on=on,
        created_at=T0 + timedelta(seconds=n), account_id=account, category=category, **kw,
    )  # fmt: skip


# Due dates -------------------------------------------------------------------------


def test_monthly_dues_clamp_to_short_months_without_drifting():
    i = item(billing_day=31, first_due_on=date(2027, 1, 31))
    assert list(due_dates(i, date(2027, 4, 30))) == [
        date(2027, 1, 31), date(2027, 2, 28), date(2027, 3, 31), date(2027, 4, 30),
    ]  # fmt: skip


def test_quarterly_yearly_and_once():
    q = item(frequency="quarterly", billing_day=5, first_due_on=date(2026, 12, 5))
    assert list(due_dates(q, date(2027, 7, 1))) == [date(2026, 12, 5), date(2027, 3, 5), date(2027, 6, 5)]
    y = item(frequency="yearly", billing_day=1, first_due_on=date(2027, 4, 1))
    assert list(due_dates(y, date(2029, 4, 1))) == [date(2027, 4, 1), date(2028, 4, 1), date(2029, 4, 1)]
    once = item(frequency="once", billing_day=3, first_due_on=date(2026, 12, 3))
    assert list(due_dates(once, date(2026, 12, 2))) == []
    assert list(due_dates(once, date(2030, 1, 1))) == [date(2026, 12, 3)]


def test_rows_from_before_012_start_after_starts_on():
    old = item(first_due_on=None, billing_day=21, starts_on=date(2026, 11, 21))
    assert first_due(old) == date(2026, 12, 21)  # the 21 Nov payment was logged with it
    earlier = item(first_due_on=None, billing_day=25, starts_on=date(2026, 11, 21))
    assert first_due(earlier) == date(2026, 11, 25)


def test_occurrences_status_overdue_and_cancelled():
    netflix = item()
    rent = item(id="i2", name="Rent", kind="rent", billing_day=1, first_due_on=date(2026, 11, 1))
    answers = {("i1", date(2026, 11, 1)): Answer("paid", "t9")}
    today = date(2026, 11, 26)
    found = occurrences([netflix, rent], answers, today, today + timedelta(days=30))
    assert [(o.item.name, o.due_on, o.status) for o in found] == [
        ("Rent", date(2026, 12, 1), "due"),
        ("Netflix", date(2026, 12, 18), "due"),
    ]
    # Rent for November was never answered: still open, never paid by itself.
    overdue = occurrences([netflix, rent], answers, today, today, open_before=True)
    assert [(o.item.name, o.due_on, o.status) for o in overdue] == [("Rent", date(2026, 11, 1), "due")]
    # A cancelled item keeps its answered months, nothing new.
    gone = item(active=False)
    cal = occurrences([gone], answers, date(2026, 11, 1), date(2027, 1, 31))
    assert [(o.due_on, o.status, o.transaction_id) for o in cal] == [(date(2026, 11, 18), "paid", "t9")]


def test_next_due_skips_answered_months():
    i = item()
    answers = {("i1", date(2026, 12, 1)): Answer("skipped", None)}
    assert next_due(i, answers, date(2026, 11, 19)) == date(2027, 1, 18)
    assert next_due(i, {}, date(2026, 11, 18)) == date(2026, 11, 18)
    assert next_due(item(active=False), {}, date(2026, 11, 1)) is None


# This month (4.4) ----------------------------------------------------------------------


def test_month_figures_income_split_refunds_and_savings_rate():
    nov = date(2026, 11, 1)
    txns = [
        txn("income", 30_000_00, date(2026, 11, 1), category="salary"),
        txn("income", 5_000_00, date(2026, 11, 10), category="freelance"),
        txn("expense", 2_000_00, date(2026, 11, 12), category="food_delivery"),
        txn("refund", 500_00, date(2026, 11, 13), category="food_delivery"),
        txn("expense", 16_500_00, date(2026, 11, 14), category="shopping"),
        # Never income or expenses:
        txn("transfer", 9_000_00, date(2026, 11, 3), to_account_id="b"),
        txn("opening", 50_000_00, date(2026, 11, 1)),
        txn("lend", 1_000_00, date(2026, 11, 2)),
        txn("adjustment", -300_00, date(2026, 11, 4)),
        txn("expense", 7_00, date(2026, 10, 31), category="other"),
    ]
    m = flows.month_figures(txns, nov, date(2026, 11, 16))
    assert (m.income, m.salary, m.other_income) == (35_000_00, 30_000_00, 5_000_00)
    assert m.expenses == 18_000_00
    assert (m.savings, m.rate) == (17_000_00, 49)
    assert flows.daily_average(m.expenses, date(2026, 11, 16)) == 1_125_00
    assert flows.by_category(txns, nov, date(2026, 11, 30)) == {"shopping": 16_500_00, "food_delivery": 1_500_00}


def test_no_income_has_no_rate_and_negative_savings():
    m = flows.month_figures([txn("expense", 2_000_00, date(2026, 11, 2), category="other")],
                            date(2026, 11, 1), date(2026, 11, 5))  # fmt: skip
    assert (m.income, m.savings, m.rate) == (0, -2_000_00, None)


def test_same_days_last_month_is_clamped():
    assert flows.same_days_last_month(date(2026, 11, 16)) == (date(2026, 10, 1), date(2026, 10, 16))
    assert flows.same_days_last_month(date(2026, 3, 31)) == (date(2026, 2, 1), date(2026, 2, 28))
    assert flows.same_days_last_month(date(2026, 1, 9)) == (date(2025, 12, 1), date(2025, 12, 9))


def test_monthly_series_oldest_first():
    txns = [txn("income", 100, date(2026, 9, 5), category="salary"), txn("expense", 40, date(2026, 11, 2), category="other")]
    series = flows.monthly_series(txns, date(2026, 11, 20), count=3)
    assert [(m.month, m.income, m.expenses) for m in series] == [
        (date(2026, 9, 1), 100, 0), (date(2026, 10, 1), 0, 0), (date(2026, 11, 1), 0, 40),
    ]  # fmt: skip


# Cash flow (4.6) -----------------------------------------------------------------------


def test_week_buckets_monday_to_sunday_without_transfers():
    txns = [
        txn("expense", 1_310_00, date(2026, 11, 12), category="food_delivery"),
        txn("income", 500_00, date(2026, 11, 10), category="other"),
        txn("transfer", 9_999_00, date(2026, 11, 12), to_account_id="b"),
    ]
    week = flows.cash_flow_buckets(txns, "week", date(2026, 11, 12))
    assert [b.start for b in week] == [date(2026, 11, 9) + timedelta(days=i) for i in range(7)]
    wed = week[3]
    assert (wed.expenses, wed.income, wed.count) == (1_310_00, 0, 1)
    assert week[1].income == 500_00


def test_month_buckets_are_weeks_cut_to_the_month_and_quarter_is_three_months():
    nov = flows.cash_flow_buckets([], "month", date(2026, 11, 20))
    assert (nov[0].start, nov[0].end) == (date(2026, 11, 1), date(2026, 11, 1))  # a Sunday
    assert (nov[-1].start, nov[-1].end) == (date(2026, 11, 30), date(2026, 11, 30))
    assert sum((b.end - b.start).days + 1 for b in nov) == 30
    q = flows.cash_flow_buckets([], "quarter", date(2026, 1, 15))
    assert [b.start for b in q] == [date(2025, 11, 1), date(2025, 12, 1), date(2026, 1, 1)]


def test_cash_flow_needs_three_days_of_data():
    opening = [txn("opening", 1, date(2026, 11, 14))]
    assert not flows.enough_for_cash_flow(opening, date(2026, 11, 15))
    assert flows.enough_for_cash_flow(opening, date(2026, 11, 16))
    assert not flows.enough_for_cash_flow([], date(2026, 11, 16))


# Net worth history and left to spend ----------------------------------------------------


def test_history_starts_at_the_first_opening():
    accounts = [Account("a", "savings")]
    txns = [
        txn("opening", 1_000_00, date(2026, 11, 10)),
        txn("expense", 100_00, date(2026, 11, 11), category="other"),
    ]
    points = flows.net_worth_history(accounts, txns, date(2026, 11, 1), date(2026, 11, 12))
    assert points == [(date(2026, 11, 10), 1_000_00), (date(2026, 11, 11), 900_00), (date(2026, 11, 12), 900_00)]
    assert flows.history_start(txns) == date(2026, 11, 10)
    assert flows.net_worth_history(accounts, [], date(2026, 11, 1), date(2026, 11, 2)) == []


def test_left_to_spend_divides_by_days_to_payday():
    # ₹50,000 free, ₹12,800 due before payday on 1 Dec, today 26 Nov: 5 days.
    assert flows.left_to_spend_today(50_000_00, 12_800_00, date(2026, 11, 26), date(2026, 12, 1)) == 7_440_00
    # Payday tomorrow still divides by one day.
    assert flows.left_to_spend_today(1_000_00, 0, date(2026, 11, 30), date(2026, 12, 1)) == 1_000_00
