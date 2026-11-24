"""Ledger API checks with an in-memory store and a faked identity.

Run: cd apps/backend && python -m pytest tests/test_ledger_api.py -v
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


def add_account(c, name="HDFC Savings", kind="savings", opening=50_000_00, on="2026-11-10"):
    r = c.post(
        f"{BASE}/accounts", params=Q,
        json={"client_key": key(), "name": name, "kind": kind, "opening_paise": opening,
              "balance_on": on},
    )  # fmt: skip
    assert r.status_code == 201, r.text
    return r.json()


def entry(c, account_id, **kw):
    body = {
        "client_key": key(), "type": "expense", "amount_paise": 500_00,
        "account_id": account_id, "category": "food_delivery", "occurred_on": TODAY, **kw,
    }  # fmt: skip
    return c.post(f"{BASE}/transactions", json=body)


# Auth ------------------------------------------------------------------------------


def test_every_ledger_route_requires_a_token():
    app.dependency_overrides[get_ledger_repo] = lambda: FakeLedger()
    some = key()
    with TestClient(app) as c:
        calls = [
            c.get(f"{BASE}/accounts", params=Q),
            c.post(f"{BASE}/accounts", params=Q, json={}),
            c.patch(f"{BASE}/accounts/{some}", params=Q, json={}),
            c.post(f"{BASE}/accounts/{some}/archive", params=Q),
            c.post(f"{BASE}/accounts/{some}/adjust", params=Q, json={}),
            c.get(f"{BASE}/transactions", params={"start": TODAY, "end": TODAY}),
            c.post(f"{BASE}/transactions", json={}),
            c.patch(f"{BASE}/transactions/{some}", json={}),
            c.delete(f"{BASE}/transactions/{some}"),
            c.post(f"{BASE}/transactions/{some}/restore"),
            c.get(f"{BASE}/net-worth", params=Q),
            c.get(f"{BASE}/position", params={"on": TODAY}),
        ]
    assert all(r.status_code == 401 for r in calls), [r.status_code for r in calls]


# Accounts ----------------------------------------------------------------------------


def test_add_account_saves_an_opening_that_is_not_income(repo):
    c = client(repo)
    account = add_account(c)
    assert account["balance_paise"] == 50_000_00
    assert [t["type"] for t in repo.txns] == ["opening"]
    nw = c.get(f"{BASE}/net-worth", params=Q).json()
    assert nw["net_worth_paise"] == 50_000_00
    assert nw["change_this_month_paise"] is None  # no full previous month


def test_add_account_retry_with_the_same_key_makes_one_account(repo):
    c = client(repo)
    body = {"client_key": key(), "name": "Cash", "kind": "cash", "opening_paise": 100_00,
            "balance_on": TODAY}  # fmt: skip
    first = c.post(f"{BASE}/accounts", params=Q, json=body).json()
    second = c.post(f"{BASE}/accounts", params=Q, json=body).json()
    assert first["id"] == second["id"] and len(repo.accounts) == 1


def test_duplicate_account_name_is_409(repo):
    c = client(repo)
    add_account(c, name="SBI")
    r = c.post(f"{BASE}/accounts", params=Q, json={
        "client_key": key(), "name": "sbi", "kind": "savings", "opening_paise": 0,
        "balance_on": TODAY})  # fmt: skip
    assert r.status_code == 409


def test_balance_on_cannot_be_in_the_future(repo):
    r = client(repo).post(f"{BASE}/accounts", params=Q, json={
        "client_key": key(), "name": "X", "kind": "cash", "opening_paise": 0,
        "balance_on": "2026-11-17"})  # fmt: skip
    assert r.status_code == 422


def test_credit_card_opening_is_money_due(repo):
    c = client(repo)
    card = add_account(c, name="ICICI Card", kind="credit_card", opening=10_000_00)
    assert card["balance_paise"] == -10_000_00
    nw = c.get(f"{BASE}/net-worth", params=Q).json()
    assert nw["card_dues_paise"] == 10_000_00 and nw["net_worth_paise"] == -10_000_00


def test_accounts_sort_largest_first_cash_last_cards_after(repo):
    c = client(repo)
    add_account(c, name="Cash", kind="cash", opening=90_000_00)
    add_account(c, name="SBI", opening=30_000_00)
    add_account(c, name="HDFC", opening=65_000_00)
    add_account(c, name="Card", kind="credit_card", opening=1_000_00)
    names = [a["name"] for a in c.get(f"{BASE}/accounts", params=Q).json()]
    assert names == ["HDFC", "SBI", "Cash", "Card"]


def test_archive_only_at_zero(repo):
    c = client(repo)
    full = add_account(c, name="Full")
    empty = add_account(c, name="Empty", opening=0)
    assert c.post(f"{BASE}/accounts/{full['id']}/archive", params=Q).status_code == 409
    assert c.post(f"{BASE}/accounts/{empty['id']}/archive", params=Q).status_code == 204
    assert [a["name"] for a in c.get(f"{BASE}/accounts", params=Q).json()] == ["Full"]


def test_edit_account_details(repo):
    c = client(repo)
    a = add_account(c)
    r = c.patch(f"{BASE}/accounts/{a['id']}", params=Q, json={"name": "Salary account", "bank": "hdfc"})
    assert r.status_code == 200 and r.json()["name"] == "Salary account"
    assert r.json()["balance_paise"] == 50_000_00


# Update balance / Reconcile -----------------------------------------------------------


def test_reconcile_saves_the_difference_with_a_reason(repo):
    c = client(repo)
    a = add_account(c)
    entry(c, a["id"], amount_paise=1_000_00)
    body = {"client_key": key(), "actual_paise": 48_800_00, "reason": "Bank charges",
            "occurred_on": TODAY}  # fmt: skip
    r = c.post(f"{BASE}/accounts/{a['id']}/adjust", params=Q, json=body)
    assert r.status_code == 201
    assert r.json()["type"] == "adjustment" and r.json()["amount_paise"] == -200_00
    assert r.json()["reason"] == "Bank charges"
    assert c.get(f"{BASE}/accounts", params=Q).json()[0]["balance_paise"] == 48_800_00
    # A retry returns the same adjustment instead of adding another.
    again = c.post(f"{BASE}/accounts/{a['id']}/adjust", params=Q, json=body)
    assert again.json()["id"] == r.json()["id"]
    assert sum(t["type"] == "adjustment" for t in repo.txns) == 1


def test_reconcile_with_no_difference_saves_nothing(repo):
    c = client(repo)
    a = add_account(c)
    r = c.post(f"{BASE}/accounts/{a['id']}/adjust", params=Q, json={
        "client_key": key(), "actual_paise": 50_000_00, "reason": "Check",
        "occurred_on": TODAY})  # fmt: skip
    assert r.status_code == 204 and len(repo.txns) == 1


def test_reconcile_a_card_takes_the_amount_due(repo):
    c = client(repo)
    card = add_account(c, name="Card", kind="credit_card", opening=1_000_00)
    r = c.post(f"{BASE}/accounts/{card['id']}/adjust", params=Q, json={
        "client_key": key(), "actual_paise": 1_500_00, "reason": "Statement",
        "occurred_on": TODAY})  # fmt: skip
    assert r.json()["amount_paise"] == -500_00


# Entries -------------------------------------------------------------------------------


def test_quick_add_retry_never_saves_twice(repo):
    c = client(repo)
    a = add_account(c)
    k = key()
    first = entry(c, a["id"], client_key=k)
    second = entry(c, a["id"], client_key=k)
    assert first.status_code == 201 and second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert sum(t["type"] == "expense" for t in repo.txns) == 1


def test_expense_income_transfer_move_balances_and_net_worth(repo):
    c = client(repo)
    bank = add_account(c, name="Bank")
    cash = add_account(c, name="Cash", kind="cash", opening=5_000_00)
    assert entry(c, bank["id"], amount_paise=2_000_00).status_code == 201
    assert entry(c, bank["id"], type="income", category="salary", amount_paise=30_000_00).status_code == 201
    assert entry(c, bank["id"], type="transfer", category=None, to_account_id=cash["id"],
                 amount_paise=1_000_00).status_code == 201  # fmt: skip
    balances = {a["name"]: a["balance_paise"] for a in c.get(f"{BASE}/accounts", params=Q).json()}
    assert balances == {"Bank": 77_000_00, "Cash": 6_000_00}
    assert c.get(f"{BASE}/net-worth", params=Q).json()["net_worth_paise"] == 83_000_00


@pytest.mark.parametrize(
    "overrides",
    [
        {"category": "salary"},  # an income category on an expense
        {"category": None},
        {"type": "income", "category": "food_delivery"},
        {"type": "transfer", "category": None},  # no destination
        {"amount_paise": 0},
        {"amount_paise": 10.5},
        {"type": "lend"},  # Khata routes own lending until P3
    ],
)
def test_invalid_entries_are_rejected(repo, overrides):
    c = client(repo)
    a = add_account(c)
    assert entry(c, a["id"], **overrides).status_code == 422


def test_transfer_to_the_same_account_is_rejected(repo):
    c = client(repo)
    a = add_account(c)
    r = entry(c, a["id"], type="transfer", category=None, to_account_id=a["id"])
    assert r.status_code == 422


def test_cannot_use_another_users_or_an_archived_account(repo):
    other = add_account(client(repo, USER_B), name="Theirs")
    c = client(repo)
    assert entry(c, other["id"]).status_code == 422
    mine = add_account(c, name="Empty", opening=0)
    c.post(f"{BASE}/accounts/{mine['id']}/archive", params=Q)
    assert entry(c, mine["id"]).status_code == 422


def test_refund_links_to_an_expense_and_is_not_income(repo):
    c = client(repo)
    a = add_account(c)
    spend = entry(c, a["id"], amount_paise=2_000_00, category="shopping").json()
    r = entry(c, a["id"], type="refund", category="shopping", amount_paise=800_00, refund_of=spend["id"])
    assert r.status_code == 201
    income = entry(c, a["id"], type="income", category="salary", refund_of=spend["id"])
    assert income.status_code == 422
    assert c.get(f"{BASE}/accounts", params=Q).json()[0]["balance_paise"] == 48_800_00


def test_edit_moves_the_effect_to_the_new_account(repo):
    c = client(repo)
    bank = add_account(c, name="Bank")
    cash = add_account(c, name="Cash", kind="cash", opening=5_000_00)
    t = entry(c, bank["id"]).json()
    body = {"amount_paise": 500_00, "account_id": cash["id"], "category": "food_delivery",
            "occurred_on": TODAY}  # fmt: skip
    assert c.patch(f"{BASE}/transactions/{t['id']}", json=body).status_code == 200
    balances = {a["name"]: a["balance_paise"] for a in c.get(f"{BASE}/accounts", params=Q).json()}
    assert balances == {"Bank": 50_000_00, "Cash": 4_500_00}


def test_backdated_entry_before_the_opening_does_not_move_the_balance(repo):
    c = client(repo)
    a = add_account(c, on="2026-11-10")
    entry(c, a["id"], occurred_on="2026-11-05")
    assert c.get(f"{BASE}/accounts", params=Q).json()[0]["balance_paise"] == 50_000_00


def test_delete_then_undo(repo):
    c = client(repo)
    a = add_account(c)
    t = entry(c, a["id"]).json()
    d = c.delete(f"{BASE}/transactions/{t['id']}")
    assert d.status_code == 200 and d.json()["deleted"] is True
    assert c.get(f"{BASE}/accounts", params=Q).json()[0]["balance_paise"] == 50_000_00
    assert c.delete(f"{BASE}/transactions/{t['id']}").status_code == 404
    u = c.post(f"{BASE}/transactions/{t['id']}/restore")
    assert u.status_code == 200 and u.json()["deleted"] is False
    assert c.get(f"{BASE}/accounts", params=Q).json()[0]["balance_paise"] == 49_500_00


def test_openings_cannot_be_deleted_or_edited_here(repo):
    c = client(repo)
    add_account(c)
    opening = repo.txns[0]["id"]
    assert c.delete(f"{BASE}/transactions/{opening}").status_code == 422
    assert c.patch(f"{BASE}/transactions/{opening}", json={
        "amount_paise": 1, "account_id": repo.accounts[0]["id"], "category": "other",
        "occurred_on": TODAY}).status_code == 422  # fmt: skip


def test_other_users_entries_are_invisible(repo):
    a = add_account(client(repo, USER_B))
    t = entry(client(repo, USER_B), a["id"]).json()
    c = client(repo)
    assert c.delete(f"{BASE}/transactions/{t['id']}").status_code == 404
    assert c.get(f"{BASE}/transactions", params={"start": TODAY, "end": TODAY}).json() == []


# History -------------------------------------------------------------------------------


def test_history_filters_and_search(repo):
    c = client(repo)
    a = add_account(c)
    entry(c, a["id"], description="Swiggy dinner")
    entry(c, a["id"], description="Uber", category="transport")
    entry(c, a["id"], type="income", category="salary", description="Salary")
    params = {"start": "2026-11-01", "end": TODAY}
    everything = c.get(f"{BASE}/transactions", params=params).json()
    assert len(everything) == 4  # three entries and the opening
    assert [t["description"] for t in c.get(
        f"{BASE}/transactions", params={**params, "q": "swig"}).json()] == ["Swiggy dinner"]  # fmt: skip
    assert len(c.get(f"{BASE}/transactions", params={**params, "type": ["expense"]}).json()) == 2
    assert len(c.get(f"{BASE}/transactions", params={**params, "category": "transport"}).json()) == 1


def test_history_range_is_bounded(repo):
    r = client(repo).get(f"{BASE}/transactions", params={"start": "2025-01-01", "end": TODAY})
    assert r.status_code == 422


# Position on a date --------------------------------------------------------------------


def test_position_on_a_past_day(repo):
    c = client(repo)
    a = add_account(c)
    entry(c, a["id"], occurred_on="2026-11-14", amount_paise=900_00)
    before = c.get(f"{BASE}/position", params={"on": "2026-11-13"}).json()
    after = c.get(f"{BASE}/position", params={"on": "2026-11-14"}).json()
    assert before["net_worth_paise"] == 50_000_00
    assert after["net_worth_paise"] == 49_100_00
