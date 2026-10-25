from datetime import date, datetime, UTC
import pytest
from pydantic import ValidationError
from app.features.money.schemas import SpendCreate, KhataCreate, StartingMoney
from app.features.money.service import net_worth, roll_forward

def test_roll_forward_leaves_a_future_date_alone():
    assert roll_forward(date(2026, 11, 5), "monthly", date(2026, 10, 24)) == date(2026, 11, 5)

def test_roll_forward_keeps_today():
    assert roll_forward(date(2026, 10, 24), "monthly", date(2026, 10, 24)) == date(2026, 10, 24)

def test_monthly_31st_clamps_without_drift():
    assert roll_forward(date(2026, 1, 31), "monthly", date(2026, 2, 10)) == date(2026, 2, 28)
    assert roll_forward(date(2026, 1, 31), "monthly", date(2026, 3, 1)) == date(2026, 3, 31)

def test_yearly_feb_29_clamps():
    assert roll_forward(date(2024, 2, 29), "yearly", date(2025, 1, 1)) == date(2025, 2, 28)

def test_net_worth_is_none_without_starting_money():
    assert net_worth(None, 100, 0, 0, 0) is None

def test_net_worth_formula():
    start = StartingMoney(bank_paise=50_000_00, cash_paise=2_000_00, set_at=datetime.now(UTC))
    assert net_worth(start, 10_000_00, 3_000_00, 1_000_00, 500_00) == (
        50_000_00 + 2_000_00 + 10_000_00 + 3_000_00 - 1_000_00 - 500_00
    )

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

def test_roll_forward_far_past_is_arithmetic_and_matches_stepping():
    assert roll_forward(date(2000, 1, 31), "monthly", date(2100, 12, 31)) == date(2100, 12, 31)
    for due, cad in [(date(2024, 2, 29), "yearly"), (date(2026, 1, 31), "monthly")]:
        for today in [date(2026, 2, 28), date(2026, 3, 1), date(2027, 2, 27), date(2029, 2, 28)]:
            step = 12 if cad == "yearly" else 1
            k = 0
            while _add(due, k * step) < today:
                k += 1
            assert roll_forward(due, cad, today) == _add(due, k * step)

def _add(d, months):
    from app.features.money.service import _add_months
    return _add_months(d, months)
