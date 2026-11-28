"""P1 API checks: scheduled items, Mark paid, Skip, the recurring toggle, this
month, cash flow and net worth history. In-memory store, faked identity.

Run: cd apps/backend && python -m pytest tests/test_p1_api.py -v
"""

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_claims
from app.features.auth.router import limiter
from app.features.money.ledger_router import get_ledger_repo
from app.main import app
from tests.fakes import FakeLedger, key

USER_A = "11111111-1111-4111-8111-111111111111"
USER_B = "22222222-2222-4222-8222-222222222222"
BASE = "/api/v1/money"
TODAY = "2026-11-16"
Q = {"today": TODAY}


@pytest.fixture(autouse=True)
def _isolate():
    limiter.enabled = False
    yield
    app.dependency_overrides.clear()
    limiter.enabled = True
    limiter.reset()


@pytest.fixture
def repo() -> FakeLedger:
    return FakeLedger()


def client(repo, user=USER_A) -> TestClient:
    app.dependency_overrides[get_ledger_repo] = lambda: repo
    app.dependency_overrides[get_current_claims] = lambda: {"sub": user}
    return TestClient(app)


def add_account(c, name="HDFC Savings", kind="savings", opening=50_000_00, on="2026-10-01"):
    r = c.post(
        f"{BASE}/accounts", params=Q,
        json={"client_key": key(), "name": name, "kind": kind, "opening_paise": opening, "balance_on": on},
    )  # fmt: skip
    assert r.status_code == 201, r.text
    return r.json()["id"]


def add_item(c, account, **kw):
    body = {
        "client_key": key(), "kind": "subscription", "name": "Netflix", "amount_paise": 199_00,
        "frequency": "monthly", "next_on": "2026-11-18", "account_id": account, **kw,
    }  # fmt: skip
    return c.post(f"{BASE}/scheduled", params=Q, json=body)


def entry(c, account, **kw):
    body = {
        "client_key": key(), "type": "expense", "amount_paise": 500_00, "account_id": account,
        "category": "food_delivery", "occurred_on": TODAY, **kw,
    }  # fmt: skip
    return c.post(f"{BASE}/transactions", json=body)


def test_new_routes_require_a_token():
    app.dependency_overrides[get_ledger_repo] = lambda: FakeLedger()
    some = key()
    with TestClient(app) as c:
        calls = [
            c.get(f"{BASE}/scheduled", params=Q),
            c.post(f"{BASE}/scheduled", params=Q, json={}),
            c.patch(f"{BASE}/scheduled/{some}", params=Q, json={}),
            c.post(f"{BASE}/scheduled/{some}/cancel"),
            c.post(f"{BASE}/scheduled/{some}/pay", params=Q, json={}),
            c.post(f"{BASE}/scheduled/{some}/skip", json={}),
            c.post(f"{BASE}/scheduled/{some}/unskip", json={}),
            c.get(f"{BASE}/dues", params={"start": TODAY, "end": TODAY}),
            c.get(f"{BASE}/month", params=Q),
            c.get(f"{BASE}/months", params=Q),
            c.get(f"{BASE}/cash-flow", params={**Q, "period": "week", "on": TODAY}),
            c.get(f"{BASE}/net-worth/history", params=Q),
        ]
    assert {r.status_code for r in calls} == {401}


def test_create_list_edit_and_cancel_an_item(repo):
    with client(repo) as c:
        bank = add_account(c)
        r = add_item(c, bank, reminder=False)
        assert r.status_code == 201, r.text
        item = r.json()
        assert (item["kind"], item["next_due_on"], item["billing_day"], item["reminder"]) == (
            "subscription", "2026-11-18", 18, False,
        )  # fmt: skip
        assert add_item(c, bank).status_code == 409  # same active name
        edited = c.patch(
            f"{BASE}/scheduled/{item['id']}", params=Q,
            json={"kind": "bill", "name": "Electricity", "amount_paise": 1_200_00, "frequency": "monthly",
                  "next_on": "2026-11-25", "account_id": bank, "variable": True},
        )  # fmt: skip
        assert edited.status_code == 200 and edited.json()["next_due_on"] == "2026-11-25"
        listed = c.get(f"{BASE}/scheduled", params=Q).json()
        assert [i["name"] for i in listed] == ["Electricity"]
        assert c.post(f"{BASE}/scheduled/{item['id']}/cancel").status_code == 204
        assert c.post(f"{BASE}/scheduled/{item['id']}/cancel").status_code == 404
        assert c.get(f"{BASE}/scheduled", params=Q).json() == []


def test_items_check_their_account_and_category(repo):
    with client(repo) as c:
        bank = add_account(c)
        assert add_item(c, key()).status_code == 422
        assert add_item(c, bank, kind="income", category="groceries").status_code == 422
        assert add_item(c, bank, kind="income", name="Salary", category="salary").status_code == 201
    with client(repo, USER_B) as c:
        assert add_item(c, bank).status_code == 422  # someone else's account


def test_dues_mark_paid_retry_and_skip(repo):
    with client(repo) as c:
        bank = add_account(c)
        item = add_item(c, bank, kind="bill", name="Electricity", variable=True, category="bills").json()
        dues = c.get(f"{BASE}/dues", params={"start": TODAY, "end": "2026-12-31"}).json()
        assert [(d["due_on"], d["status"]) for d in dues] == [("2026-11-18", "due"), ("2026-12-18", "due")]

        pay = {"client_key": key(), "due_on": "2026-11-18", "amount_paise": 1_310_00,
               "account_id": bank, "occurred_on": TODAY}  # fmt: skip
        first = c.post(f"{BASE}/scheduled/{item['id']}/pay", params=Q, json=pay)
        assert first.status_code == 201, first.text
        txn = first.json()
        assert (txn["type"], txn["amount_paise"], txn["category"], txn["schedule_id"]) == (
            "expense", 1_310_00, "bills", item["id"],
        )  # fmt: skip
        again = c.post(f"{BASE}/scheduled/{item['id']}/pay", params=Q, json=pay)
        assert again.json()["id"] == txn["id"]
        twice = c.post(f"{BASE}/scheduled/{item['id']}/pay", params=Q, json={**pay, "client_key": key()})
        assert twice.status_code == 409
        assert len(repo.live(USER_A, "expense")) == 1

        assert c.post(f"{BASE}/scheduled/{item['id']}/skip", json={"due_on": "2026-12-18"}).status_code == 204
        assert c.post(f"{BASE}/scheduled/{item['id']}/skip", json={"due_on": "2026-12-18"}).status_code == 409
        dues = c.get(f"{BASE}/dues", params={"start": TODAY, "end": "2026-12-31"}).json()
        assert [d["status"] for d in dues] == ["paid", "skipped"]
        assert c.post(f"{BASE}/scheduled/{item['id']}/unskip", json={"due_on": "2026-12-18"}).status_code == 204
        assert c.get(f"{BASE}/scheduled", params=Q).json()[0]["next_due_on"] == "2026-12-18"


def test_pay_refuses_wrong_dates_and_other_users(repo):
    with client(repo) as c:
        bank = add_account(c)
        item = add_item(c, bank).json()
        pay = {"client_key": key(), "due_on": "2026-11-19", "amount_paise": 1,
               "account_id": bank, "occurred_on": TODAY}  # fmt: skip
        assert c.post(f"{BASE}/scheduled/{item['id']}/pay", params=Q, json=pay).status_code == 422
        future = {**pay, "due_on": "2026-11-18", "occurred_on": "2026-11-17"}
        assert c.post(f"{BASE}/scheduled/{item['id']}/pay", params=Q, json=future).status_code == 422
    with client(repo, USER_B) as c:
        other = {**pay, "due_on": "2026-11-18"}
        assert c.post(f"{BASE}/scheduled/{item['id']}/pay", params=Q, json=other).status_code == 404
        assert c.post(f"{BASE}/scheduled/{item['id']}/skip", json={"due_on": "2026-11-18"}).status_code == 404


def test_overdue_stays_open_and_is_never_paid_by_itself(repo):
    with client(repo) as c:
        bank = add_account(c)
        add_item(c, bank, kind="rent", name="Rent", category="bills", next_on="2026-11-01")
        dues = c.get(f"{BASE}/dues", params={"start": TODAY, "end": TODAY, "open_before": "true"}).json()
        assert [(d["name"], d["due_on"], d["status"]) for d in dues] == [("Rent", "2026-11-01", "due")]
    assert repo.live(USER_A, "expense") == []


def test_recurring_income_makes_an_item_and_the_recurring_filter_finds_it(repo):
    with client(repo) as c:
        bank = add_account(c)
        r = entry(
            c, bank, type="income", category="salary", description="Salary", amount_paise=30_000_00,
            occurred_on="2026-11-01", repeat={"frequency": "monthly", "next_on": "2026-12-01"},
        )  # fmt: skip
        assert r.status_code == 201, r.text
        assert r.json()["schedule_id"]
        items = c.get(f"{BASE}/scheduled", params=Q).json()
        assert [(i["kind"], i["name"], i["next_due_on"]) for i in items] == [("income", "Salary", "2026-12-01")]
        entry(c, bank)  # not recurring
        rows = c.get(f"{BASE}/transactions", params={"start": "2026-11-01", "end": TODAY, "recurring": "true"}).json()
        assert [t["description"] for t in rows] == ["Salary"]
        bad = entry(c, bank, repeat={"frequency": "monthly", "next_on": TODAY})
        assert bad.status_code == 422  # next date must be after the entry's
        transfer = entry(c, bank, type="transfer", category=None, to_account_id=add_account(c, "Cash", "cash"),
                         repeat={"frequency": "monthly", "next_on": "2026-12-16"})  # fmt: skip
        assert transfer.status_code == 422


def test_this_month_tiles_and_left_to_spend(repo):
    with client(repo) as c:
        bank = add_account(c)
        empty = c.get(f"{BASE}/month", params=Q).json()
        assert (empty["income_paise"], empty["savings_rate"], empty["left_to_spend"]) == (0, None, None)

        entry(c, bank, type="income", category="salary", description="Salary", amount_paise=30_000_00,
              occurred_on="2026-11-01", repeat={"frequency": "monthly", "next_on": "2026-12-01"})  # fmt: skip
        entry(c, bank, type="income", category="freelance", amount_paise=5_000_00, occurred_on="2026-11-05")
        entry(c, bank, amount_paise=18_000_00, occurred_on="2026-11-10")
        entry(c, bank, amount_paise=2_000_00, occurred_on="2026-10-12")  # last month, same days
        entry(c, bank, amount_paise=9_000_00, occurred_on="2026-10-20")  # last month, later
        add_item(c, bank, name="Netflix", next_on="2026-11-18")
        add_item(c, bank, kind="rent", name="Rent", category="bills", amount_paise=12_000_00, next_on="2026-12-01")

        m = c.get(f"{BASE}/month", params=Q).json()
        assert (m["income_paise"], m["salary_paise"], m["other_income_paise"]) == (35_000_00, 30_000_00, 5_000_00)
        assert (m["expenses_paise"], m["daily_average_paise"]) == (18_000_00, 1_125_00)
        assert m["expenses_same_days_last_month_paise"] == 2_000_00
        assert (m["savings_paise"], m["savings_rate"]) == (17_000_00, 49)
        # Dues to the end of the month: Netflix only; income is never a due.
        assert (m["dues_paise"], m["dues_count"]) == (199_00, 1)
        assert m["categories"] == [{"category": "food_delivery", "paise": 18_000_00}]
        lts = m["left_to_spend"]
        assert lts["next_salary_on"] == "2026-12-01"
        assert lts["dues_before_paise"] == 199_00  # rent is due on payday, not before
        # Bank: 50,000 + 35,000 − 18,000 − 2,000 − 9,000 = 56,000 free; 15 days to payday.
        assert lts["free_paise"] == 56_000_00
        assert lts["per_day_paise"] == (56_000_00 - 199_00) // 15


def test_months_cash_flow_and_history(repo):
    with client(repo) as c:
        bank = add_account(c, on="2026-11-10")
        entry(c, bank, amount_paise=1_310_00, occurred_on="2026-11-11")
        entry(c, bank, type="income", category="other", amount_paise=500_00, occurred_on="2026-11-16")
        months = c.get(f"{BASE}/months", params={**Q, "count": 2}).json()
        assert [(m["month"], m["expenses_paise"]) for m in months] == [("2026-10-01", 0), ("2026-11-01", 1_310_00)]

        week = c.get(f"{BASE}/cash-flow", params={**Q, "period": "week", "on": "2026-11-12"}).json()
        assert len(week["buckets"]) == 7 and week["buckets"][0]["start"] == "2026-11-09"
        assert (week["received_paise"], week["spent_paise"], week["remaining_paise"]) == (0, 1_310_00, -1_310_00)
        assert week["enough_data"] is True
        assert c.get(f"{BASE}/cash-flow", params={**Q, "period": "year", "on": TODAY}).status_code == 422

        hist = c.get(f"{BASE}/net-worth/history", params={**Q, "days": 30}).json()
        assert hist["history_starts"] == "2026-11-10"
        assert hist["points"][0] == {"on": "2026-11-10", "net_worth_paise": 50_000_00}
        assert hist["points"][-1] == {"on": TODAY, "net_worth_paise": 50_000_00 - 1_310_00 + 500_00}
        assert c.get(f"{BASE}/net-worth/history", params={**Q, "days": 400}).status_code == 422


def test_reminders_cover_bills_and_rent_but_not_income_or_reminders_off(repo):
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    from app.features.assessment.router import get_assessment_repo

    class NoResult:
        async def get_latest_result(self, user_id):
            return None

    class Money(FakeLedger):
        async def list_spends(self, *a, **k):
            return []

        async def get_nudges(self, user_id):
            from app.features.money.schemas import Nudges

            return Nudges(pre_spend=False, patterns=False, weekly=False)

        async def list_templates(self, archetypes):
            return []

    repo = Money()
    tomorrow = (datetime.now(ZoneInfo("Asia/Kolkata")).date() + timedelta(days=1)).isoformat()
    with client(repo) as c:
        app.dependency_overrides[get_assessment_repo] = lambda: NoResult()
        from app.features.money.router import get_money_repo

        app.dependency_overrides[get_money_repo] = lambda: repo
        bank = add_account(c)
        rent = add_item(c, bank, kind="rent", name="Rent", category="bills", next_on=tomorrow).json()
        add_item(c, bank, kind="income", name="Salary", category="salary", next_on=tomorrow)
        add_item(c, bank, name="Quiet", next_on=tomorrow, reminder=False)
        plan = c.get("/api/v1/profile/nudges/plan").json()
    assert [n["id"].split(":")[1] for n in plan] == [rent["id"]]
    assert plan[0]["title"] == "Rent is due today"
