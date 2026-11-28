"""The old endpoints' shapes, built from the ledger (app.features.money.legacy)."""

from datetime import UTC, date, datetime

from app.features.money import legacy
from app.features.money.ledger import Txn


def acct(id_, kind, created="2026-11-01T00:00:00+00:00", archived=None):
    return {"id": id_, "kind": kind, "created_at": created, "archived_at": archived}


def txn(type_, amount, on, account=None, **kw):
    return Txn(
        id=f"{type_}-{account}-{amount}", type=type_, amount_paise=amount, occurred_on=on,
        created_at=datetime(on.year, on.month, on.day, 12, tzinfo=UTC), account_id=account, **kw,
    )  # fmt: skip


ROWS = [
    acct("bank", "savings", "2026-11-01T00:00:00+00:00"),
    acct("bank2", "current", "2026-11-02T00:00:00+00:00"),
    acct("cash", "cash"),
    acct("card", "credit_card"),
]
OPEN = date(2026, 11, 10)


def test_every_category_round_trips_and_new_ones_show_as_other():
    for old, new in legacy.OLD_TO_NEW.items():
        assert legacy.old_category(new) == old
    for new in ("health", "education", "travel", "personal_care", None):
        assert legacy.old_category(new) == "other"


def test_pick_account_prefers_the_first_bank_or_cash_and_skips_archived():
    assert legacy.pick_account(ROWS, "bank") == "bank"
    assert legacy.pick_account(ROWS, "cash") == "cash"
    archived = [acct("bank", "savings", archived="2026-11-20T00:00:00+00:00"), *ROWS[1:]]
    assert legacy.pick_account(archived, "bank") == "bank2"
    assert legacy.pick_account([acct("cash", "cash")], "bank") == "cash"  # falls back
    assert legacy.pick_account([acct("card", "credit_card")], "bank") is None


def test_summary_reports_todays_bank_and_cash_and_counts_khata():
    txns = [
        txn("opening", 50_000, OPEN, "bank"),
        txn("opening", 10_000, OPEN, "bank2"),
        txn("opening", 2_000, OPEN, "cash"),
        txn("opening", -5_000, OPEN, "card"),
        txn("expense", 1_000, date(2026, 11, 12), "bank", category="groceries"),
        txn("lend", 500, date(2026, 11, 12), "cash", khata_entry_id="k1"),
    ]
    s = legacy.build_summary(ROWS, txns, date(2026, 11, 16))
    assert s.starting_money.bank_paise == 59_000 and s.starting_money.cash_paise == 1_500
    assert s.balance_paise == 60_500
    assert s.owed_to_you_paise == 500 and s.you_owe_paise == 0
    assert s.net_worth_paise == 60_500 + 500 - 5_000
    assert s.spent_since_update_paise == 0 and s.received_since_update_paise == 0


def test_summary_without_accounts_is_null_but_shows_khata():
    s = legacy.build_summary([], [txn("borrow", 700, OPEN, khata_entry_id="k")], OPEN)
    assert s.net_worth_paise is None and s.starting_money is None and s.balance_paise is None
    assert s.you_owe_paise == 700


def test_trend_is_bank_plus_cash_per_day_with_spending():
    txns = [
        txn("opening", 1_000, OPEN, "cash"),
        txn("opening", -300, OPEN, "card"),  # cards are not in the old balance
        txn("expense", 100, date(2026, 11, 11), "cash", category="food_delivery"),
        txn("expense", 50, date(2026, 11, 11), "card", category="shopping"),
    ]
    rows = [acct("cash", "cash"), acct("card", "credit_card")]  # every real account has an opening
    pts = legacy.build_trend(rows, txns, date(2026, 11, 9), date(2026, 11, 11))
    assert [p.balance_paise for p in pts] == [None, 1_000, 900]
    assert [p.spent_paise for p in pts] == [0, 0, 150]


def test_only_expenses_are_spends():
    rows = [
        {"id": "1", "type": "expense", "amount_paise": 5, "category": "food_delivery",
         "description": "Chai", "occurred_on": "2026-11-16", "created_at": "2026-11-16T01:00:00+00:00"},
        {"id": "2", "type": "repayment_made", "amount_paise": 9, "category": None,
         "description": "Ravi", "occurred_on": "2026-11-16", "created_at": "2026-11-16T01:00:00+00:00"},
    ]  # fmt: skip
    [spend] = legacy.spends_of(rows)
    assert spend.id == "1" and spend.category == "food"
