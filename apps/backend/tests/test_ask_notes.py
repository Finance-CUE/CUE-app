"""P4 rules: Ask CUE's reader (ask.py), notes (notes.py) and merchants (words.py).

Run: cd apps/backend && python -m pytest tests/test_ask_notes.py -v
"""

from datetime import UTC, date, datetime, timedelta

from app.features.money import ask as A
from app.features.money import notes as N
from app.features.money import words
from app.features.money.ledger import Txn

TODAY = date(2026, 11, 16)  # a Monday
T0 = datetime(2026, 1, 1, tzinfo=UTC)
HDFC = A.AccountInfo("hdfc", "HDFC Savings", "savings", "hdfc", 65_000_00)
CASH = A.AccountInfo("cash", "Cash", "cash", None, 5_000_00)


def ctx(**kw) -> A.Context:
    base = dict(today=TODAY, accounts=[HDFC, CASH], entries=[], owed=[], dues=[], jars=[], net_worth_paise=83_104_00,
                available_paise=70_000_00)  # fmt: skip
    return A.Context(**{**base, **kw})


def entry(id_, type_, amount, on, category=None, description=None):
    return A.Entry(id_, type_, amount, on, category, description, "hdfc")


# Reading pieces --------------------------------------------------------------------------


def test_amounts_dates_and_accounts():
    assert A.read_amount("I spent ₹1,250 on dinner") == 1_250_00
    assert A.read_amount("paid 2k for rent") == 2_000_00
    assert A.read_amount("got 1.5 lakh bonus") == 1_50_000_00
    assert A.read_amount("spent 300 on 12 nov") == 300_00  # the day isn't the amount
    assert A.read_amount("dinner") is None
    assert A.read_date("yesterday", TODAY) == date(2026, 11, 15)
    assert A.read_date("day before yesterday", TODAY) == date(2026, 11, 14)
    assert A.read_date("on friday", TODAY) == date(2026, 11, 13)
    assert A.read_date("on monday", TODAY) == date(2026, 11, 9)  # the last Monday, not today
    assert A.read_date("12 nov", TODAY) == date(2026, 11, 12)
    assert A.read_date("20 dec", TODAY) == date(2025, 12, 20)  # a future day this year means last year
    assert [a.id for a in A.read_accounts("moved 500 from hdfc to cash", [HDFC, CASH])] == ["hdfc", "cash"]


# Drafts ------------------------------------------------------------------------------------


def test_the_spec_example_becomes_an_expense_draft():
    r = A.ask(ctx(), "I spent ₹500 on dinner yesterday using HDFC")
    assert r.kind == "draft"
    assert r.draft == {"type": "expense", "amount_paise": 500_00, "category": "food_delivery", "description": "Dinner",
                       "account_id": "hdfc", "occurred_on": "2026-11-15"}  # fmt: skip
    assert "{{₹50000}}" in r.text and "Save" in r.text


def test_transfer_lend_borrow_and_income_drafts():
    t = A.ask(ctx(), "Moved ₹5,000 from HDFC to cash").draft
    assert (t["type"], t["account_id"], t["to_account_id"], t["amount_paise"]) == ("transfer", "hdfc", "cash", 5_000_00)
    lend = A.ask(ctx(), "lent 2000 to Ravi").draft
    assert (lend["type"], lend["person"], lend["account_id"]) == ("lend", "Ravi", "cash")
    borrow = A.ask(ctx(), "borrowed 500 from megha on friday").draft
    assert (borrow["type"], borrow["person"], borrow["occurred_on"]) == ("borrow", "Megha", "2026-11-13")
    income = A.ask(ctx(), "received salary 30000").draft
    assert (income["type"], income["category"], income["account_id"]) == ("income", "salary", "hdfc")


# Questions ---------------------------------------------------------------------------------


def test_spending_questions_by_category_and_period():
    entries = [
        entry("a", "expense", 1_200_00, date(2026, 11, 10), "food_delivery", "Swiggy"),
        entry("b", "expense", 300_00, date(2026, 11, 3), "transport", "Uber"),
        entry("c", "expense", 900_00, date(2026, 10, 5), "food_delivery", "Zomato"),
        entry("d", "income", 30_000_00, date(2026, 11, 1), "salary", "Salary"),
    ]
    c = ctx(entries=entries)
    assert A.ask(c, "How much did I spend on food this month?").text == "You spent {{₹120000}} on Food & delivery this month."
    assert A.ask(c, "how much did I spend last month?").text == "You spent {{₹90000}} last month."
    assert A.ask(c, "what did I spend in october").text == "You spent {{₹90000}} October."
    assert A.ask(c, "How much did I earn this month?").text == "You received {{₹3000000}} this month."
    saved = A.ask(c, "how much have I saved this month?")
    assert saved.text == "You saved {{₹2850000}} this month." and "Savings rate 95%" in saved.lines
    assert "Swiggy" in A.ask(c, "what was my biggest spend this month?").text


def test_balances_owed_dues_jars_and_net_worth():
    c = ctx(
        owed=[A.Owed("Ravi", "lent", 2_000_00), A.Owed("Aditi", "lent", 500_00), A.Owed("Megha", "borrowed", 300_00)],
        dues=[A.DueInfo("Netflix", 199_00, date(2026, 11, 18)), A.DueInfo("Rent", 12_000_00, date(2026, 12, 1))],
        jars=[A.JarInfo("Goa Trip", 12_000_00, 30_000_00, 40)],
    )
    assert A.ask(c, "who owes me money?").text == "2 people owe you {{₹250000}}."
    assert A.ask(c, "how much does Ravi owe me?").text == "Ravi owes you {{₹200000}}."
    assert A.ask(c, "who do I owe?").text == "You owe {{₹30000}}."
    assert A.ask(c, "what's due this week?").text == "{{₹19900}} due this week."
    assert A.ask(c, "how is my Goa Trip jar?").lines == ["Goa Trip: {{₹1200000}} of {{₹3000000}} (40%)"]
    assert A.ask(c, "what's my net worth?").text == "Your net worth is {{₹8310400}}."
    assert A.ask(c, "what's the balance in HDFC?").text == "HDFC Savings has {{₹6500000}}."


def test_unknown_gets_help_and_nothing_is_ever_saved():
    r = A.ask(ctx(), "tell me a joke")
    assert r.kind == "help" and r.suggestions
    assert A.ask(ctx(), "").kind == "help"


# Merchants ---------------------------------------------------------------------------------


def test_merchant_and_category_words():
    assert words.merchant_of("Paid to Zepto") == "zepto"
    assert words.merchant_of("Swiggy dinner") == "swiggy"
    assert words.merchant_of("  ") is None
    assert words.suggest_expense("Zepto order") == "groceries"
    assert words.suggest_income("November salary") == "salary"


# Notes -------------------------------------------------------------------------------------

_n = iter(range(10_000))


def txn(type_, amount, on, category=None, **kw) -> Txn:
    return Txn(f"t{next(_n)}", type_, amount, on, T0, "a", category=category, **kw)


def test_no_note_before_a_week_of_logging():
    assert not N.has_enough_data([txn("expense", 100, TODAY - timedelta(days=3), "other")], TODAY)
    assert N.has_enough_data([txn("expense", 100, TODAY - timedelta(days=6), "other")], TODAY)
    assert not N.has_enough_data([txn("opening", 100, TODAY - timedelta(days=30))], TODAY)


def test_priority_due_then_pending_then_category():
    dues = [N.Due("s", "Netflix", 199_00, TODAY + timedelta(days=2))]
    owed = [N.Pending("Aditi", 2_000_00, TODAY - timedelta(days=16))]
    txns = [txn("expense", 5_900_00, TODAY - timedelta(days=2), "food_delivery"),
            txn("expense", 5_000_00, date(2026, 10, 10), "food_delivery")]  # fmt: skip
    first = N.choose(txns, dues, owed, [], {}, TODAY)
    assert first.kind == "due_soon" and first.params["name"] == "Netflix"
    # Dismissed: the next one by priority.
    second = N.choose(txns, dues, owed, [], {first.key: N.Seen(dismissed_on=TODAY)}, TODAY)
    assert second.kind == "pending" and second.params == {"person": "Aditi", "amount_paise": 2_000_00, "days": 16}
    third = N.choose(txns, [], [], [], {}, TODAY)
    assert third.kind == "category_up" and third.params["percent"] == 18


def test_shown_today_stays_and_shown_recently_is_skipped():
    dues = [N.Due("s", "Netflix", 199_00, TODAY + timedelta(days=1))]
    note = N.due_soon(dues, TODAY)
    assert N.pick([note], {note.key: N.Seen(last_shown_on=TODAY)}, TODAY) == note
    assert N.pick([note], {note.key: N.Seen(last_shown_on=TODAY - timedelta(days=3))}, TODAY) is None
    assert N.pick([note], {note.key: N.Seen(last_shown_on=TODAY - timedelta(days=7))}, TODAY) == note


def test_small_rises_are_not_notes_and_jar_milestones():
    tiny = [txn("expense", 120_00, TODAY - timedelta(days=1), "other"), txn("expense", 100_00, date(2026, 10, 3), "other")]
    assert N.category_up(tiny, TODAY) is None  # 20% up but only ₹20
    j = N.jar_milestone([N.JarState("j1", "Goa", 16_000_00, 30_000_00), N.JarState("j2", "Bike", 1_000_00, 30_000_00)])
    assert (j.params["name"], j.params["milestone"]) == ("Goa", 50)


def test_streak_needs_three_weeks_under_the_usual():
    monday = TODAY - timedelta(days=TODAY.weekday())
    txns = []
    for i in range(1, 12):
        start = monday - timedelta(weeks=i)
        txns.append(txn("expense", 1_000_00 if i <= 3 else 3_000_00, start + timedelta(days=2), "food_delivery"))
    s = N.streak(txns, TODAY)
    assert s is not None and s.params["weeks"] == 3
    assert N.streak(txns[:2], TODAY) is None


# API -----------------------------------------------------------------------------------

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.api.dependencies.auth import get_current_claims  # noqa: E402
from app.features.auth.router import limiter  # noqa: E402
from app.features.money.ledger_router import get_ledger_repo  # noqa: E402
from app.main import app  # noqa: E402
from tests.fakes import FakeMoney, key  # noqa: E402

USER = "11111111-1111-4111-8111-111111111111"
BASE = "/api/v1/money"
Q = {"today": TODAY.isoformat()}


@pytest.fixture
def api():
    limiter.enabled = False
    repo = FakeMoney()
    app.dependency_overrides[get_ledger_repo] = lambda: repo
    app.dependency_overrides[get_current_claims] = lambda: {"sub": USER}
    with TestClient(app) as c:
        yield c, repo
    app.dependency_overrides.clear()
    limiter.enabled = True
    limiter.reset()


def _setup(c):
    acct = c.post(f"{BASE}/accounts", params=Q, json={
        "client_key": key(), "name": "HDFC Savings", "kind": "savings", "bank": "hdfc", "opening_paise": 50_000_00,
        "balance_on": "2026-09-01",
    }).json()["id"]  # fmt: skip
    return acct


def _expense(c, acct, amount, on, desc="Swiggy dinner", category="food_delivery"):
    r = c.post(f"{BASE}/transactions", json={"client_key": key(), "type": "expense", "amount_paise": amount,
                                             "account_id": acct, "category": category, "description": desc,
                                             "occurred_on": on})  # fmt: skip
    assert r.status_code == 201, r.text
    return r.json()


def test_note_routes_getting_to_know_then_a_note_and_dismiss(api):
    c, repo = api
    acct = _setup(c)
    assert c.get(f"{BASE}/note", params=Q).json() == {"getting_to_know": True, "note": None}
    _expense(c, acct, 5_000_00, "2026-10-10")
    _expense(c, acct, 5_900_00, "2026-11-12")
    n = c.get(f"{BASE}/note", params=Q).json()
    assert n["getting_to_know"] is False and n["note"]["kind"] == "category_up"
    assert n["note"]["details"]["transactions"][0]["description"] == "Swiggy dinner"
    assert c.post(f"{BASE}/note/dismiss", params=Q, json={"key": n["note"]["key"]}).status_code == 204
    assert c.get(f"{BASE}/note", params=Q).json()["note"] is None


def test_ask_route_answers_and_drafts_without_saving(api):
    c, repo = api
    acct = _setup(c)
    _expense(c, acct, 1_200_00, "2026-11-10")
    before = len(repo.txns)
    r = c.post(f"{BASE}/ask", params=Q, json={"query": "How much did I spend on food this month?"}).json()
    assert (r["kind"], r["text"]) == ("answer", "You spent {{₹120000}} on Food & delivery this month.")
    d = c.post(f"{BASE}/ask", params=Q, json={"query": "spent 250 on uber yesterday from hdfc"}).json()
    assert d["kind"] == "draft" and d["draft"]["category"] == "transport" and d["draft"]["account_id"] == acct
    assert len(repo.txns) == before  # nothing saved


def test_fix_category_and_remember_the_merchant(api):
    c, repo = api
    acct = _setup(c)
    t = _expense(c, acct, 300_00, "2026-11-15", desc="Zepto order", category="shopping")
    r = c.post(f"{BASE}/transactions/{t['id']}/category", json={"category": "groceries", "remember": True})
    assert r.status_code == 200 and r.json()["category"] == "groceries"
    assert c.get(f"{BASE}/merchant-categories").json() == [{"merchant": "zepto", "kind": "expense", "category": "groceries"}]
    assert c.post(f"{BASE}/transactions/{t['id']}/category", json={"category": "salary"}).status_code == 422
