"""The ledger formulas against the spec's section 8 rules table: one test per row.

Each row checks the four columns: account balance, counts as income, counts as
expense, receivable / liability, and net worth.
"""

from datetime import UTC, date, datetime
from itertools import count

import pytest

from app.features.money.ledger import (
    Account,
    Txn,
    account_balances_on,
    can_archive,
    change_this_month,
    counts_as_expense,
    counts_as_income,
    position_on,
    reconcile_delta,
)

BANK = Account("bank", "savings")
CASH = Account("cash", "cash")
CARD = Account("card", "credit_card")
ACCOUNTS = [BANK, CASH, CARD]

SETUP = date(2026, 11, 10)
DAY = date(2026, 11, 16)
_ids = count(1)


def at(d: date, hour: int = 12) -> datetime:
    return datetime(d.year, d.month, d.day, hour, tzinfo=UTC)


def txn(type_, amount, *, on=DAY, created=None, **kw) -> Txn:
    return Txn(
        id=f"t{next(_ids)}",
        type=type_,
        amount_paise=amount,
        occurred_on=on,
        created_at=created or at(on, 14),
        **kw,
    )


def openings(bank=50_000_00, cash=5_000_00, card=0) -> list[Txn]:
    """Bank ₹50,000, cash ₹5,000 and a card with nothing due, as of SETUP 09:00."""
    return [
        txn("opening", bank, on=SETUP, created=at(SETUP, 9), account_id="bank"),
        txn("opening", cash, on=SETUP, created=at(SETUP, 9), account_id="cash"),
        txn("opening", card, on=SETUP, created=at(SETUP, 9), account_id="card"),
    ]


BASE = openings()
BASE_NET = 55_000_00


def apply(*extra: Txn):
    txns = [*BASE, *extra]
    return account_balances_on(ACCOUNTS, txns, DAY), position_on(ACCOUNTS, txns, DAY)


# The rules table ----------------------------------------------------------------


def test_opening_balance_sets_the_starting_position_and_is_not_income():
    balances, pos = apply()
    assert balances == {"bank": 50_000_00, "cash": 5_000_00, "card": 0}
    assert pos.net_worth_paise == BASE_NET
    assert not counts_as_income(BASE[0]) and not counts_as_expense(BASE[0])


def test_income_adds_to_the_account_and_net_worth():
    t = txn("income", 30_000_00, account_id="bank", category="salary")
    balances, pos = apply(t)
    assert balances["bank"] == 80_000_00
    assert counts_as_income(t) and not counts_as_expense(t)
    assert pos.net_worth_paise == BASE_NET + 30_000_00


def test_expense_from_bank_or_cash_comes_off_the_account_and_net_worth():
    t = txn("expense", 500_00, account_id="cash", category="food_delivery")
    balances, pos = apply(t)
    assert balances["cash"] == 4_500_00
    assert counts_as_expense(t) and not counts_as_income(t)
    assert pos.net_worth_paise == BASE_NET - 500_00


def test_expense_on_a_credit_card_raises_the_card_due_on_the_spend_date():
    t = txn("expense", 2_000_00, account_id="card", category="shopping")
    balances, pos = apply(t)
    assert balances["card"] == -2_000_00
    assert balances["bank"] == 50_000_00
    assert counts_as_expense(t)
    assert pos.card_dues_paise == 2_000_00
    assert pos.net_worth_paise == BASE_NET - 2_000_00


def test_card_bill_payment_is_a_transfer_and_not_an_expense():
    spend = txn("expense", 2_000_00, account_id="card", category="shopping")
    bill = txn("transfer", 2_000_00, account_id="bank", to_account_id="card")
    balances, pos = apply(spend, bill)
    assert balances["bank"] == 48_000_00 and balances["card"] == 0
    assert not counts_as_expense(bill)  # rule 3: the spend already counted
    assert pos.card_dues_paise == 0
    _, before = apply(spend)
    assert pos.net_worth_paise == before.net_worth_paise  # no change


def test_transfer_between_own_accounts_changes_nothing_overall():
    t = txn("transfer", 1_000_00, account_id="bank", to_account_id="cash")
    balances, pos = apply(t)
    assert balances["bank"] == 49_000_00 and balances["cash"] == 6_000_00
    assert not counts_as_income(t) and not counts_as_expense(t)  # rule 1
    assert pos.net_worth_paise == BASE_NET


def test_lend_moves_money_out_and_adds_a_receivable_net_worth_unchanged():
    t = txn("lend", 3_000_00, account_id="bank", khata_entry_id="k1")
    balances, pos = apply(t)
    assert balances["bank"] == 47_000_00
    assert pos.receivables_paise == 3_000_00
    assert not counts_as_expense(t)  # rule 4
    assert pos.net_worth_paise == BASE_NET


def test_repayment_received_brings_money_back_and_clears_the_receivable():
    lend = txn("lend", 3_000_00, account_id="bank", khata_entry_id="k1")
    back = txn("repayment_received", 3_000_00, account_id="cash", khata_entry_id="k1")
    balances, pos = apply(lend, back)
    assert balances["bank"] == 47_000_00 and balances["cash"] == 8_000_00
    assert pos.receivables_paise == 0
    assert not counts_as_income(back)
    assert pos.net_worth_paise == BASE_NET


def test_borrow_adds_money_and_a_liability_net_worth_unchanged():
    t = txn("borrow", 2_500_00, account_id="cash", khata_entry_id="k2")
    balances, pos = apply(t)
    assert balances["cash"] == 7_500_00
    assert pos.borrowings_paise == 2_500_00
    assert not counts_as_income(t)  # rule 5
    assert pos.net_worth_paise == BASE_NET


def test_repayment_made_moves_money_out_and_clears_the_liability():
    borrow = txn("borrow", 2_500_00, account_id="cash", khata_entry_id="k2")
    paid = txn("repayment_made", 2_500_00, account_id="bank", khata_entry_id="k2")
    balances, pos = apply(borrow, paid)
    assert balances["bank"] == 47_500_00
    assert pos.borrowings_paise == 0
    assert not counts_as_expense(paid)
    assert pos.net_worth_paise == BASE_NET


def test_refund_adds_money_and_is_not_income():
    t = txn("refund", 800_00, account_id="bank", category="shopping")
    balances, pos = apply(t)
    assert balances["bank"] == 50_800_00
    assert not counts_as_income(t)  # rule 7: it reduces expenses instead
    assert pos.net_worth_paise == BASE_NET + 800_00


@pytest.mark.parametrize("delta", [1_200_00, -1_200_00])
def test_balance_adjustment_moves_the_account_either_way_and_is_neither(delta):
    t = txn("adjustment", delta, account_id="bank")
    balances, pos = apply(t)
    assert balances["bank"] == 50_000_00 + delta
    assert not counts_as_income(t) and not counts_as_expense(t)
    assert pos.net_worth_paise == BASE_NET + delta


# "Balance on" and recalculation (rule 8) -----------------------------------------


def test_a_spend_dated_before_the_opening_is_not_subtracted_twice():
    """The 1.1.0 audit bug: last week's spend added after setup."""
    late = txn("expense", 700_00, on=date(2026, 11, 5), created=at(DAY), account_id="bank",
               category="transport")
    balances, _ = apply(late)
    assert balances["bank"] == 50_000_00


def test_same_day_spends_count_only_if_entered_after_the_opening():
    before = txn("expense", 100_00, on=SETUP, created=at(SETUP, 8), account_id="bank",
                 category="food_delivery")
    after = txn("expense", 200_00, on=SETUP, created=at(SETUP, 20), account_id="bank",
                category="food_delivery")
    balances, _ = apply(before, after)
    assert balances["bank"] == 50_000_00 - 200_00


def test_editing_the_date_or_account_moves_the_effect():
    original = txn("expense", 500_00, on=DAY, account_id="bank", category="bills")
    moved = Txn(**{**original.__dict__, "occurred_on": date(2026, 11, 20), "account_id": "cash"})
    assert apply(original)[0]["bank"] == 49_500_00
    balances, _ = apply(moved)  # now in the future relative to DAY, and on cash
    assert balances["bank"] == 50_000_00 and balances["cash"] == 5_000_00
    later = account_balances_on(ACCOUNTS, [*BASE, moved], date(2026, 11, 20))
    assert later["cash"] == 4_500_00 and later["bank"] == 50_000_00


def test_balance_is_unknown_before_the_opening_date():
    balances = account_balances_on(ACCOUNTS, BASE, date(2026, 11, 9))
    assert balances == {"bank": None, "cash": None, "card": None}
    assert position_on(ACCOUNTS, BASE, date(2026, 11, 9)).net_worth_paise == 0


def test_position_on_a_past_day_ignores_later_transactions():
    t = txn("expense", 900_00, on=date(2026, 11, 14), account_id="bank", category="groceries")
    txns = [*BASE, t]
    assert position_on(ACCOUNTS, txns, date(2026, 11, 13)).net_worth_paise == BASE_NET
    assert position_on(ACCOUNTS, txns, date(2026, 11, 14)).net_worth_paise == BASE_NET - 900_00


def test_khata_copied_without_an_account_counts_only_in_net_worth():
    """Migration (answer 4): open entries carry no account, so bank and cash stay put."""
    lend = Txn(id="old-lend", type="lend", amount_paise=3_000_00, occurred_on=date(2026, 11, 1),
               created_at=at(date(2026, 11, 1)), khata_entry_id="k1")
    borrow = Txn(id="old-borrow", type="borrow", amount_paise=1_000_00,
                 occurred_on=date(2026, 11, 2), created_at=at(date(2026, 11, 2)),
                 khata_entry_id="k2")
    balances, pos = apply(lend, borrow)
    assert balances["bank"] == 50_000_00 and balances["cash"] == 5_000_00
    assert pos.receivables_paise == 3_000_00 and pos.borrowings_paise == 1_000_00
    assert pos.net_worth_paise == BASE_NET + 3_000_00 - 1_000_00


def test_spec_worked_example_net_worth():
    """Section 4.2: assets ₹1,07,000 − liabilities ₹23,896 = ₹83,104."""
    accounts = [Account("hdfc", "savings"), Account("sbi", "savings"), Account("icici", "savings"),
                Account("cash", "cash"), Account("card", "credit_card")]
    txns = [
        txn("opening", 65_000_00, on=SETUP, account_id="hdfc"),
        txn("opening", 30_000_00, on=SETUP, account_id="sbi"),
        txn("opening", 5_000_00, on=SETUP, account_id="icici"),
        txn("opening", 5_000_00, on=SETUP, account_id="cash"),
        txn("opening", -10_000_00, on=SETUP, account_id="card"),
        Txn(id="l", type="lend", amount_paise=2_000_00, occurred_on=SETUP,
            created_at=at(SETUP), khata_entry_id="k1"),
        Txn(id="b", type="borrow", amount_paise=13_896_00, occurred_on=SETUP,
            created_at=at(SETUP), khata_entry_id="k2"),
    ]
    pos = position_on(accounts, txns, DAY)
    assert pos.available_paise == 1_05_000_00
    assert pos.total_assets_paise == 1_07_000_00
    assert pos.total_liabilities_paise == 23_896_00
    assert pos.net_worth_paise == 83_104_00


# Change this month (suggestion 27) ----------------------------------------------


def test_change_is_hidden_without_a_full_previous_month():
    assert change_this_month(ACCOUNTS, BASE, DAY) is None  # set up 10 Nov
    early = openings()
    early = [Txn(**{**t.__dict__, "occurred_on": date(2026, 10, 5)}) for t in early]
    assert change_this_month(ACCOUNTS, early, DAY) is None  # October not full


def test_change_excludes_opening_balances_added_this_month():
    old = [Txn(**{**t.__dict__, "occurred_on": date(2026, 9, 30), "created_at": at(date(2026, 9, 30))})
           for t in openings()]
    savings = Account("new", "savings")
    new_account = txn("opening", 20_000_00, on=date(2026, 11, 3), account_id="new")
    salary = txn("income", 5_200_00, on=date(2026, 11, 5), account_id="bank", category="salary")
    change = change_this_month([*ACCOUNTS, savings], [*old, new_account, salary], DAY)
    assert change == 5_200_00  # "↑ ₹5,200 this month", not ₹25,200


# The account screen (4.5) ----------------------------------------------------------


def test_account_movements_count_only_what_moved_the_balance():
    txns = [
        *BASE,
        txn("income", 30_000_00, on=date(2026, 11, 12), account_id="bank", category="salary"),
        txn("expense", 500_00, on=date(2026, 11, 13), account_id="bank", category="bills"),
        txn("transfer", 1_000_00, on=date(2026, 11, 14), account_id="bank", to_account_id="cash"),
        txn("adjustment", -200_00, on=date(2026, 11, 15), account_id="bank"),
        # Inside the opening balance: dated before setup, so not a movement.
        txn("expense", 9_999_00, on=date(2026, 11, 5), created=at(DAY), account_id="bank", category="bills"),
    ]
    from app.features.money.ledger import account_movements

    assert account_movements("bank", txns, date(2026, 11, 1), DAY) == (30_000_00, 1_700_00)
    assert account_movements("cash", txns, date(2026, 11, 1), DAY) == (1_000_00, 0)


def test_account_months_newest_first_with_closing_balances():
    from app.features.money.ledger import account_months

    txns = [
        *BASE,
        txn("expense", 500_00, on=date(2026, 11, 13), account_id="bank", category="bills"),
    ]
    months = account_months(BANK, txns, DAY, count=3)
    assert [m.month for m in months] == [date(2026, 11, 1), date(2026, 10, 1), date(2026, 9, 1)]
    assert (months[0].money_in, months[0].money_out, months[0].closing) == (0, 500_00, 49_500_00)
    assert months[1].closing is None  # before the "Balance on" date


# Reconcile and archive ------------------------------------------------------------


def test_reconcile_saves_the_difference_as_the_adjustment():
    assert reconcile_delta(calculated_paise=50_000_00, actual_paise=48_800_00) == -1_200_00
    assert reconcile_delta(50_000_00, 50_000_00) == 0


def test_archive_only_at_zero():
    assert can_archive(0)
    assert not can_archive(1_00) and not can_archive(-1_00) and not can_archive(None)
