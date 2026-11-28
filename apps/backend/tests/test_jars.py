"""Goal Jars: the pure rules (jars.py) and the API (jars_router.py).

Run: cd apps/backend && python -m pytest tests/test_jars.py -v
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_claims
from app.features.auth.router import limiter
from app.features.money import jars as J
from app.features.money.ledger_router import get_ledger_repo
from app.main import app
from tests.fakes import FakeLedger, key

USER_A = "11111111-1111-4111-8111-111111111111"
USER_B = "22222222-2222-4222-8222-222222222222"
BASE = "/api/v1/money"
TODAY = "2026-11-16"
Q = {"today": TODAY}


def jar(**kw) -> J.Jar:
    base = dict(
        id="j1", name="Goa Trip", target_paise=30_000_00, target_date=date(2027, 3, 15), account_id="a",
        method="manual", contribution_paise=None, next_contribution_on=None, status="active",
        created_on=date(2026, 9, 15),
    )  # fmt: skip
    return J.Jar(**{**base, **kw})


# Rules ---------------------------------------------------------------------------------


def test_progress_remaining_and_suggested_monthly():
    assert J.progress(12_000_00, 30_000_00) == 40
    assert J.progress(40_000_00, 30_000_00) == 100
    # ₹18,000 left, 16 Nov → 15 Mar is 4 months (rounded up to 5 with the extra days? no: 15 < 16).
    assert J.months_left(date(2026, 11, 16), date(2027, 3, 15)) == 4
    assert J.months_left(date(2026, 11, 16), date(2027, 3, 20)) == 5
    assert J.months_left(date(2026, 11, 16), date(2026, 11, 20)) == 1
    assert J.suggested_monthly(12_000_00, 30_000_00, date(2027, 3, 15), date(2026, 11, 16)) == 4_500_00
    assert J.suggested_monthly(12_000_00, 30_000_00, None, date(2026, 11, 16)) is None
    assert J.suggested_monthly(30_000_00, 30_000_00, date(2027, 3, 15), date(2026, 11, 16)) is None


def test_behind_only_with_a_target_date_and_over_ten_points():
    today = date(2026, 12, 15)  # half way from 15 Sep to 15 Mar
    assert J.is_behind(jar(), 10_000_00, today)  # 33% < 50 − 10
    assert not J.is_behind(jar(), 12_100_00, today)  # 40.3% is within 10 points
    assert not J.is_behind(jar(target_date=None), 0, today)
    assert not J.is_behind(jar(status="paused"), 0, today)
    assert not J.is_behind(jar(), 0, date(2027, 4, 1))  # past the date: "Target date passed" instead


def test_states_and_free_balance():
    assert J.state(jar(status="paused"), 0, date(2026, 11, 16)) == "paused"
    assert J.state(jar(status="complete"), 0, date(2026, 11, 16)) == "complete"
    assert J.state(jar(), 0, date(2027, 4, 1)) == "date_passed"
    assert J.state(jar(), 30_000_00, date(2027, 4, 1)) == "active"
    moves = [J.Move("m1", "j1", 10_000_00, "a", date(2026, 11, 1)), J.Move("m2", "j2", 5_000_00, "a", date(2026, 11, 1)),
             J.Move("m3", "j1", -2_000_00, "a", date(2026, 11, 2))]  # fmt: skip
    assert J.saved("j1", moves) == 8_000_00
    assert J.in_jars_by_account(moves) == {"a": 13_000_00}
    assert J.free_balance(65_000_00, 13_000_00) == 52_000_00
    assert J.free_balance(None, 0) is None
    assert J.can_add(52_000_00, 52_000_00) and not J.can_add(52_000_01, 52_000_00)


def test_contribution_dates_and_due():
    assert J.next_contribution("weekly", date(2026, 11, 16), None) == date(2026, 11, 23)
    assert J.next_contribution("monthly", date(2027, 1, 31), None) == date(2027, 2, 28)
    assert J.next_contribution("payday", date(2026, 11, 16), date(2026, 12, 1)) == date(2026, 12, 2)
    assert J.next_contribution("payday", date(2026, 11, 16), None) is None
    assert J.next_contribution("manual", date(2026, 11, 16), None) is None
    due = jar(method="monthly", contribution_paise=2_000_00, next_contribution_on=date(2026, 11, 16))
    assert J.contribution_due(due, date(2026, 11, 16))
    assert not J.contribution_due(due, date(2026, 11, 15))
    assert not J.contribution_due(jar(method="monthly", contribution_paise=1, next_contribution_on=date(2026, 11, 1),
                                      status="paused"), date(2026, 11, 16))  # fmt: skip


# API -------------------------------------------------------------------------------------


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


def add_account(c, name="HDFC Savings", kind="savings", opening=65_000_00):
    r = c.post(f"{BASE}/accounts", params=Q, json={
        "client_key": key(), "name": name, "kind": kind, "opening_paise": opening, "balance_on": "2026-10-01",
    })  # fmt: skip
    assert r.status_code == 201, r.text
    return r.json()["id"]


def make_jar(c, account, **kw):
    body = {"client_key": key(), "name": "Goa Trip", "icon": "🏖️", "target_paise": 30_000_00,
            "target_date": "2027-03-15", "account_id": account, "initial_paise": 10_000_00, **kw}  # fmt: skip
    return c.post(f"{BASE}/jars", params=Q, json=body)


def move(c, jar_id, action, amount, **kw):
    return c.post(f"{BASE}/jars/{jar_id}/{action}", params=Q,
                  json={"client_key": key(), "amount_paise": amount, "occurred_on": TODAY, **kw})  # fmt: skip


def test_every_jar_route_requires_a_token():
    app.dependency_overrides[get_ledger_repo] = lambda: FakeLedger()
    some = key()
    with TestClient(app) as c:
        calls = [
            c.get(f"{BASE}/jars", params=Q),
            c.post(f"{BASE}/jars", params=Q, json={}),
            c.get(f"{BASE}/jars/{some}", params=Q),
            c.patch(f"{BASE}/jars/{some}", params=Q, json={}),
            c.post(f"{BASE}/jars/{some}/add", params=Q, json={}),
            c.post(f"{BASE}/jars/{some}/withdraw", params=Q, json={}),
            c.post(f"{BASE}/jars/{some}/contribution", params=Q, json={}),
            c.post(f"{BASE}/jars/{some}/archive", params=Q),
            c.delete(f"{BASE}/jars/moves/{some}", params=Q),
        ]
    assert {r.status_code for r in calls} == {401}


def test_create_jar_sets_money_aside_without_moving_balances(repo):
    with client(repo) as c:
        bank = add_account(c)
        before = c.get(f"{BASE}/net-worth", params=Q).json()
        r = make_jar(c, bank)
        assert r.status_code == 201, r.text
        j = r.json()
        assert (j["saved_paise"], j["progress"], j["remaining_paise"], j["state"]) == (10_000_00, 33, 20_000_00, "active")
        after = c.get(f"{BASE}/net-worth", params=Q).json()
        # Rules 2 and 11: balances and net worth stay the same.
        assert after["net_worth_paise"] == before["net_worth_paise"]
        account = next(a for a in after["accounts"] if a["id"] == bank)
        assert (account["balance_paise"], account["in_jars_paise"], account["free_paise"]) == (65_000_00, 10_000_00, 55_000_00)
        listed = c.get(f"{BASE}/jars", params=Q).json()
        assert (listed["total_saved_paise"], listed["count"]) == (10_000_00, 1)


def test_create_retry_does_not_add_twice_and_card_accounts_are_refused(repo):
    with client(repo) as c:
        bank = add_account(c)
        card = add_account(c, "Card", "credit_card", 0)
        body_key = key()
        make_jar(c, bank, client_key=body_key)
        make_jar(c, bank, client_key=body_key)
        assert c.get(f"{BASE}/jars", params=Q).json()["total_saved_paise"] == 10_000_00
        assert make_jar(c, card).status_code == 422
        assert make_jar(c, bank, method="weekly").status_code == 422  # no amount per contribution
        assert make_jar(c, bank, method="payday", contribution_paise=100).status_code == 422  # no salary yet


def test_allocation_guard_on_create_and_add(repo):
    with client(repo) as c:
        bank = add_account(c, opening=20_000_00)
        assert make_jar(c, bank, initial_paise=20_000_01).status_code == 409
        j = make_jar(c, bank, initial_paise=15_000_00).json()
        assert move(c, j["id"], "add", 5_000_01).status_code == 409
        assert move(c, j["id"], "add", 5_000_00).status_code == 201


def test_withdraw_undo_and_reaching_the_target(repo):
    with client(repo) as c:
        bank = add_account(c)
        j = make_jar(c, bank).json()
        assert move(c, j["id"], "withdraw", 10_000_01).status_code == 409
        w = move(c, j["id"], "withdraw", 4_000_00).json()
        assert c.get(f"{BASE}/jars/{j['id']}", params=Q).json()["jar"]["saved_paise"] == 6_000_00
        assert c.delete(f"{BASE}/jars/moves/{w['id']}", params=Q).status_code == 200
        assert c.get(f"{BASE}/jars/{j['id']}", params=Q).json()["jar"]["saved_paise"] == 10_000_00
        added = move(c, j["id"], "add", 20_000_00).json()
        detail = c.get(f"{BASE}/jars/{j['id']}", params=Q).json()
        assert (detail["jar"]["status"], detail["jar"]["state"], detail["jar"]["progress"]) == ("complete", "complete", 100)
        assert [m["amount_paise"] for m in detail["moves"]][:1] == [20_000_00]
        # Undoing the add before the celebration reopens it.
        c.delete(f"{BASE}/jars/moves/{added['id']}", params=Q)
        assert c.get(f"{BASE}/jars/{j['id']}", params=Q).json()["jar"]["status"] == "active"


def test_suggested_contributions_wait_for_approval(repo):
    with client(repo) as c:
        bank = add_account(c)
        j = make_jar(c, bank, method="monthly", contribution_paise=2_000_00, initial_paise=0).json()
        assert (j["next_contribution_on"], j["contribution_due"]) == ("2026-12-16", False)
        later = {"today": "2026-12-16"}
        listed = c.get(f"{BASE}/jars", params=later).json()["jars"][0]
        assert listed["contribution_due"] is True and listed["saved_paise"] == 0  # nothing added by itself
        answer = {"client_key": key(), "due_on": "2026-12-16", "approve": True}
        assert c.post(f"{BASE}/jars/{j['id']}/contribution", params=later, json=answer).status_code == 204
        assert c.post(f"{BASE}/jars/{j['id']}/contribution", params=later, json=answer).status_code == 204  # retry
        after = c.get(f"{BASE}/jars", params=later).json()["jars"][0]
        assert (after["saved_paise"], after["next_contribution_on"], after["contribution_due"]) == (2_000_00, "2027-01-16", False)
        skip = {"client_key": key(), "due_on": "2026-12-16", "approve": False}
        assert c.post(f"{BASE}/jars/{j['id']}/contribution", params=later, json=skip).status_code == 409


def test_pause_complete_edit_and_archive(repo):
    with client(repo) as c:
        bank = add_account(c)
        cash = add_account(c, "Cash", "cash", 20_000_00)
        j = make_jar(c, bank).json()
        assert c.post(f"{BASE}/jars/{j['id']}/pause").status_code == 204
        assert c.get(f"{BASE}/jars/{j['id']}", params=Q).json()["jar"]["state"] == "paused"
        assert c.post(f"{BASE}/jars/{j['id']}/resume", params=Q).status_code == 204
        edit = {"name": "Goa", "icon": "✈️", "target_paise": 40_000_00, "target_date": None, "account_id": cash}
        r = c.patch(f"{BASE}/jars/{j['id']}", params=Q, json=edit)
        assert r.status_code == 200 and r.json()["account_id"] == cash and r.json()["saved_paise"] == 10_000_00
        accounts = {a["id"]: a for a in c.get(f"{BASE}/accounts", params=Q).json()}
        assert (accounts[bank]["in_jars_paise"], accounts[cash]["in_jars_paise"]) == (0, 10_000_00)
        # A jar on the account blocks archiving the account.
        assert c.post(f"{BASE}/accounts/{cash}/archive", params=Q).status_code == 409
        assert c.post(f"{BASE}/jars/{j['id']}/complete", params=Q).status_code == 204
        assert c.post(f"{BASE}/jars/{j['id']}/celebrated").status_code == 204
        assert c.post(f"{BASE}/jars/{j['id']}/archive", params=Q).status_code == 204
        assert c.get(f"{BASE}/jars", params=Q).json()["count"] == 0
        accounts = {a["id"]: a for a in c.get(f"{BASE}/accounts", params=Q).json()}
        assert accounts[cash]["in_jars_paise"] == 0  # archiving released the money


def test_jars_hold_more_than_the_account_and_left_to_spend_uses_free_balance(repo):
    with client(repo) as c:
        bank = add_account(c, opening=20_000_00)
        j = make_jar(c, bank, initial_paise=15_000_00).json()
        c.post(f"{BASE}/transactions", json={
            "client_key": key(), "type": "expense", "amount_paise": 10_000_00, "account_id": bank,
            "category": "shopping", "occurred_on": TODAY,
        })  # fmt: skip
        detail = c.get(f"{BASE}/jars/{j['id']}", params=Q).json()["jar"]
        assert detail["account_short_paise"] == 5_000_00  # "Your jars hold more than HDFC has"
        assert detail["saved_paise"] == 15_000_00  # never shrunk silently
        c.post(f"{BASE}/transactions", json={
            "client_key": key(), "type": "income", "amount_paise": 50_000_00, "account_id": bank,
            "category": "salary", "description": "Salary", "occurred_on": "2026-11-01",
            "repeat": {"frequency": "monthly", "next_on": "2026-12-01"},
        })  # fmt: skip
        lts = c.get(f"{BASE}/month", params=Q).json()["left_to_spend"]
        # Bank 20,000 − 10,000 + 50,000 = 60,000; jars hold 15,000 → 45,000 free.
        assert lts["free_paise"] == 45_000_00


def test_other_users_cannot_touch_a_jar(repo):
    with client(repo) as c:
        bank = add_account(c)
        j = make_jar(c, bank).json()
    with client(repo, USER_B) as c:
        assert c.get(f"{BASE}/jars/{j['id']}", params=Q).status_code == 404
        assert move(c, j["id"], "add", 1).status_code == 404
        assert c.post(f"{BASE}/jars/{j['id']}/archive", params=Q).status_code == 404
