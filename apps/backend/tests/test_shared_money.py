"""P3 shared money: group rules (groups.py), the group API, Khata part payments
and the breakdown's separate personal and group rows.

Run: cd apps/backend && python -m pytest tests/test_shared_money.py -v
"""

from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_claims
from app.features.auth.router import limiter
from app.features.money import groups as G
from app.features.money import ledger
from app.features.money.ledger import Account, Txn
from app.features.money.ledger_router import get_ledger_repo
from app.features.money.router import get_money_repo
from app.main import app
from tests.fakes import FakeMoney, key

USER_A = "11111111-1111-4111-8111-111111111111"
USER_B = "22222222-2222-4222-8222-222222222222"
BASE = "/api/v1/money"
TODAY = "2026-11-16"
Q = {"today": TODAY}


# Rules ---------------------------------------------------------------------------------


def test_equal_split_spreads_leftover_paise_and_exact_must_add_up():
    assert G.equal_shares(1000, ["a", "b", "c"]) == {"a": 334, "b": 333, "c": 333}
    assert sum(G.equal_shares(10_001, ["a", "b", "c", "d"]).values()) == 10_001
    assert G.exact_shares(300, {"a": 200, "b": 100, "c": 0}) == {"a": 200, "b": 100}
    with pytest.raises(ValueError, match="short"):
        G.exact_shares(300, {"a": 100})
    with pytest.raises(ValueError, match="over"):
        G.exact_shares(300, {"a": 400})
    with pytest.raises(ValueError):
        G.equal_shares(100, [])


def test_balances_and_settle_up():
    e1 = G.Expense("e1", "me", 3_000_00, {"me": 1_000_00, "megha": 1_000_00, "aditi": 1_000_00})
    e2 = G.Expense("e2", "megha", 1_500_00, {"me": 500_00, "megha": 500_00, "aditi": 500_00})
    s = G.Settlement("s1", "aditi", "me", 1_000_00)
    bal = G.balances(["me", "megha", "aditi"], [e1, e2], [s])
    # Me: paid 3,000, shares 1,000 + 500, received 1,000. Megha: paid 1,500, shares 1,000 + 500.
    # Aditi: shares 1,000 + 500, paid 1,000 back.
    assert bal == {"me": 500_00, "megha": 0, "aditi": -500_00}
    assert sum(bal.values()) == 0
    steps = G.settle_up(bal)
    after = dict(bal)
    for frm, to, amt in steps:
        after[frm] += amt
        after[to] -= amt
    assert all(v == 0 for v in after.values()) and len(steps) <= 2


def test_ledger_rows_follow_section_8():
    # I paid ₹3,000 for three: expense ₹1,000 + lend ₹2,000, both from my account.
    paid = G.expense_rows("me", G.Expense("e", "me", 3_000_00, {"me": 1_000_00, "a": 1_000_00, "b": 1_000_00}),
                          "acct", "Dinner", "food_delivery")  # fmt: skip
    assert [(r["type"], r["amount_paise"], r["account_id"]) for r in paid] == [
        ("expense", 1_000_00, "acct"), ("lend", 2_000_00, "acct"),
    ]  # fmt: skip
    # Someone else paid, my share ₹500: expense ₹500 + borrow ₹500, no account.
    other = G.expense_rows("me", G.Expense("e", "a", 1_500_00, {"me": 500_00, "a": 1_000_00}), None, "Cab", "transport")
    assert [(r["type"], r["amount_paise"], r["account_id"]) for r in other] == [("expense", 500_00, None), ("borrow", 500_00, None)]
    # Not mine at all: nothing on my ledger.
    assert G.expense_rows("me", G.Expense("e", "a", 100, {"a": 100}), None, "x", "other") == []
    assert G.settlement_rows("me", G.Settlement("s", "a", "me", 1_000_00), "acct", "A paid you")[0]["type"] == "repayment_received"
    assert G.settlement_rows("me", G.Settlement("s", "a", "b", 100), None, "x") == []


def test_position_counts_groups_apart_from_personal_khata():
    t0 = datetime(2026, 1, 1, tzinfo=UTC)
    accounts = [Account("acct", "savings")]
    txns = [
        Txn("o", "opening", 10_000_00, date(2026, 11, 1), t0, "acct"),
        Txn("k", "lend", 1_000_00, date(2026, 11, 2), t0, "acct", khata_entry_id="k1"),
        Txn("g1", "expense", 1_000_00, date(2026, 11, 3), t0, "acct", category="food_delivery", group_id="goa"),
        Txn("g2", "lend", 2_000_00, date(2026, 11, 3), t0, "acct", group_id="goa"),
        Txn("g3", "expense", 500_00, date(2026, 11, 4), t0, None, category="transport", group_id="flat"),
        Txn("g4", "borrow", 500_00, date(2026, 11, 4), t0, None, group_id="flat"),
    ]
    p = ledger.position_on(accounts, txns, date(2026, 11, 16))
    assert (p.money_lent_paise, p.group_owed_paise, p.group_owe_paise) == (1_000_00, 2_000_00, 500_00)
    assert p.receivables_paise == 3_000_00 and p.borrowings_paise == 500_00
    # ₹10,000 − 1,000 lent − 3,000 paid = 6,000 in the bank; + 3,000 owed − 500 owed = 8,500.
    assert p.net_worth_paise == 8_500_00


# API ------------------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _isolate():
    limiter.enabled = False
    yield
    app.dependency_overrides.clear()
    limiter.enabled = True
    limiter.reset()


@pytest.fixture
def repo() -> FakeMoney:
    return FakeMoney()


def client(repo, user=USER_A) -> TestClient:
    app.dependency_overrides[get_ledger_repo] = lambda: repo
    app.dependency_overrides[get_money_repo] = lambda: repo
    app.dependency_overrides[get_current_claims] = lambda: {"sub": user}
    return TestClient(app)


def add_account(c, name="HDFC Savings", kind="savings", opening=50_000_00):
    r = c.post(f"{BASE}/accounts", params=Q, json={
        "client_key": key(), "name": name, "kind": kind, "opening_paise": opening, "balance_on": "2026-10-01",
    })  # fmt: skip
    assert r.status_code == 201, r.text
    return r.json()["id"]


def make_group(c, members=("Megha", "Aditi")):
    r = c.post(f"{BASE}/groups", json={"client_key": key(), "name": "Goa Trip", "icon": "🏖️", "members": list(members)})
    assert r.status_code == 201, r.text
    g = r.json()
    detail = c.get(f"{BASE}/groups/{g['id']}").json()
    ids = {m["name"]: m["id"] for m in detail["members"]}
    return g["id"], ids


def expense(c, group, paid_by, **kw):
    body = {"client_key": key(), "description": "Dinner", "category": "food_delivery", "amount_paise": 3_000_00,
            "paid_by": paid_by, "split": "equal", "occurred_on": TODAY, **kw}  # fmt: skip
    return c.post(f"{BASE}/groups/{group}/expenses", params=Q, json=body)


def test_group_routes_require_a_token():
    app.dependency_overrides[get_ledger_repo] = lambda: FakeMoney()
    some = key()
    with TestClient(app) as c:
        calls = [
            c.get(f"{BASE}/groups"), c.post(f"{BASE}/groups", json={}), c.get(f"{BASE}/groups/{some}"),
            c.post(f"{BASE}/groups/{some}/expenses", params=Q, json={}),
            c.post(f"{BASE}/groups/{some}/settlements", params=Q, json={}),
            c.delete(f"{BASE}/groups/expenses/{some}"),
        ]  # fmt: skip
    assert {r.status_code for r in calls} == {401}


def test_i_paid_for_three_moves_my_account_and_makes_a_receivable(repo):
    with client(repo) as c:
        bank = add_account(c)
        g, m = make_group(c)
        r = expense(c, g, m["You"], participants=[m["You"], m["Megha"], m["Aditi"]], account_id=bank)
        assert r.status_code == 201, r.text
        assert r.json()["my_share_paise"] == 1_000_00
        nw = c.get(f"{BASE}/net-worth", params=Q).json()
        assert next(a for a in nw["accounts"] if a["id"] == bank)["balance_paise"] == 47_000_00
        assert (nw["group_owed_paise"], nw["money_lent_paise"]) == (2_000_00, 0)
        assert nw["net_worth_paise"] == 49_000_00  # down by my share only
        month = c.get(f"{BASE}/month", params=Q).json()
        assert month["expenses_paise"] == 1_000_00  # my share counts as spending
        detail = c.get(f"{BASE}/groups/{g}").json()
        bal = {x["name"]: x["balance_paise"] for x in detail["members"]}
        assert bal == {"You": 2_000_00, "Megha": -1_000_00, "Aditi": -1_000_00}
        assert sorted(s["amount_paise"] for s in detail["settle_up"]) == [1_000_00, 1_000_00]
        groups = c.get(f"{BASE}/groups").json()
        assert (groups["owed_to_you_paise"], groups["groups"][0]["my_balance_paise"]) == (2_000_00, 2_000_00)


def test_someone_else_paid_my_share_is_a_liability_and_no_account_moves(repo):
    with client(repo) as c:
        bank = add_account(c)
        g, m = make_group(c)
        r = expense(c, g, m["Megha"], split="exact", amount_paise=1_500_00,
                    shares={m["You"]: 500_00, m["Megha"]: 1_000_00})  # fmt: skip
        assert r.status_code == 201, r.text
        nw = c.get(f"{BASE}/net-worth", params=Q).json()
        assert next(a for a in nw["accounts"] if a["id"] == bank)["balance_paise"] == 50_000_00
        assert (nw["group_owe_paise"], nw["net_worth_paise"]) == (500_00, 49_500_00)
        # The exact split must add up.
        bad = expense(c, g, m["Megha"], split="exact", amount_paise=1_500_00, shares={m["You"]: 500_00})
        assert bad.status_code == 422 and "short" in bad.json()["detail"]
        # I paid but chose no account.
        assert expense(c, g, m["You"], participants=[m["You"]]).status_code == 422


def test_settlement_edit_delete_undo_and_archive(repo):
    with client(repo) as c:
        bank = add_account(c)
        g, m = make_group(c, ("Megha",))
        e = expense(c, g, m["You"], participants=[m["You"], m["Megha"]], account_id=bank, amount_paise=2_000_00).json()
        assert c.post(f"{BASE}/groups/{g}/archive").status_code == 409  # not settled
        s = c.post(f"{BASE}/groups/{g}/settlements", params=Q, json={
            "client_key": key(), "from_member": m["Megha"], "to_member": m["You"], "amount_paise": 1_000_00,
            "occurred_on": TODAY, "account_id": bank,
        })  # fmt: skip
        assert s.status_code == 201, s.text
        nw = c.get(f"{BASE}/net-worth", params=Q).json()
        assert nw["group_owed_paise"] == 0
        assert next(a for a in nw["accounts"] if a["id"] == bank)["balance_paise"] == 49_000_00
        rows = c.get(f"{BASE}/transactions", params={"start": TODAY, "end": TODAY}).json()
        settle_row = next(t for t in rows if t["group_settlement_id"])
        assert (settle_row["type"], settle_row["description"]) == ("repayment_received", "Megha paid you")
        # Group rows are changed in the group, not through /transactions.
        assert c.delete(f"{BASE}/transactions/{settle_row['id']}").status_code == 422
        # Editing recalculates: now ₹4,000 split equally.
        edit = c.put(f"{BASE}/groups/expenses/{e['id']}", params=Q, json={
            "client_key": key(), "description": "Dinner", "category": "food_delivery", "amount_paise": 4_000_00,
            "paid_by": m["You"], "split": "equal", "participants": [m["You"], m["Megha"]], "occurred_on": TODAY,
            "account_id": bank,
        })  # fmt: skip
        assert edit.status_code == 200, edit.text
        assert c.get(f"{BASE}/net-worth", params=Q).json()["group_owed_paise"] == 1_000_00
        assert c.delete(f"{BASE}/groups/expenses/{e['id']}").status_code == 204
        assert c.get(f"{BASE}/net-worth", params=Q).json()["group_owed_paise"] == 0
        assert c.get(f"{BASE}/groups/{g}").json()["members"][1]["balance_paise"] == 1_000_00  # Megha overpaid
        assert c.post(f"{BASE}/groups/expenses/{e['id']}/restore").status_code == 204
        assert c.get(f"{BASE}/net-worth", params=Q).json()["group_owed_paise"] == 1_000_00


def test_members_can_be_added_and_removed_only_when_unused(repo):
    with client(repo) as c:
        bank = add_account(c)
        g, m = make_group(c, ("Megha",))
        expense(c, g, m["You"], participants=[m["You"], m["Megha"]], account_id=bank)
        body = {"name": "Goa", "icon": "✈️", "add_members": ["Ravi"], "remove_members": []}
        assert c.patch(f"{BASE}/groups/{g}", json=body).status_code == 200
        ravi = next(x["id"] for x in c.get(f"{BASE}/groups/{g}").json()["members"] if x["name"] == "Ravi")
        assert c.patch(f"{BASE}/groups/{g}", json={**body, "add_members": [], "remove_members": [m["Megha"]]}).status_code == 409
        assert c.patch(f"{BASE}/groups/{g}", json={**body, "add_members": [], "remove_members": [ravi]}).status_code == 200
        assert c.patch(f"{BASE}/groups/{g}", json={**body, "add_members": ["megha"]}).status_code == 422  # already there
    with client(repo, USER_B) as c:
        assert c.get(f"{BASE}/groups/{g}").status_code == 404


# Khata part payments ------------------------------------------------------------------


def lend(c, person="Ravi", amount=2_000_00, **kw):
    r = c.post(f"{BASE}/khata", json={"direction": "lent", "person": person, "amount_paise": amount,
                                      "client_key": key(), **kw})  # fmt: skip
    assert r.status_code == 201, r.text
    return r.json()


def test_lend_with_a_date_and_due_date(repo):
    with client(repo) as c:
        add_account(c, "Cash", "cash", 5_000_00)
        e = lend(c, occurred_on="2026-11-10", due_on="2026-12-01")
        assert (e["due_on"], e["outstanding_paise"]) == ("2026-12-01", 2_000_00)
        lend_row = next(t for t in repo.live(USER_A, "lend"))
        assert lend_row["occurred_on"] == "2026-11-10"


def test_part_payment_then_overpayment_needs_confirmation(repo):
    with client(repo) as c:
        cash = add_account(c, "Cash", "cash", 5_000_00)
        lend(c)
        pay = {"client_key": key(), "person": "Ravi", "from_them": True, "amount_paise": 500_00,
               "account_id": cash, "occurred_on": TODAY}  # fmt: skip
        assert c.post(f"{BASE}/khata/settle-person", json=pay).status_code == 204
        open_ = c.get(f"{BASE}/khata").json()
        assert [(e["amount_paise"], e["outstanding_paise"]) for e in open_] == [(2_000_00, 1_500_00)]
        over = {**pay, "client_key": key(), "amount_paise": 2_000_00}
        r = c.post(f"{BASE}/khata/settle-person", json=over)
        assert r.status_code == 409 and "₹1,500" in r.json()["detail"]
        assert c.post(f"{BASE}/khata/settle-person", json={**over, "allow_over": True}).status_code == 204
        open_ = c.get(f"{BASE}/khata").json()
        # The ₹500 beyond what was owed: Ravi is now owed ₹500 (a borrowed entry).
        assert [(e["direction"], e["outstanding_paise"]) for e in open_] == [("borrowed", 500_00)]
        nw = c.get(f"{BASE}/net-worth", params=Q).json()
        assert (nw["money_lent_paise"], nw["money_borrowed_paise"]) == (0, 500_00)
