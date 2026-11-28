"""Money and profile API checks with an in-memory repository and a faked identity.

Run: cd apps/backend && python -m pytest tests/test_money_api.py -v
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_claims
from app.features.assessment.router import get_assessment_repo
from app.features.auth.router import limiter
from app.features.money.repository import MoneyStoreError
from app.features.money.router import get_money_repo
from app.features.money.schemas import Nudges
from app.main import app
from tests.fakes import FakeMoney, key, now

USER_A = "11111111-1111-4111-8111-111111111111"
USER_B = "22222222-2222-4222-8222-222222222222"

BASE = "/api/v1/money"
PROFILE = "/api/v1/profile"
NUDGES = f"{PROFILE}/nudges"

IST = ZoneInfo("Asia/Kolkata")
SPEND = {"description": "Chai", "amount_paise": 2000, "category": "food", "spent_on": "2026-10-24"}


FakeRepo = FakeMoney


class BrokenRepo:
    async def list_transactions(self, user_id, start=None, end=None, include_deleted=False):
        raise MoneyStoreError("Money service unavailable.")


def _client(repo, user: str = USER_A) -> TestClient:
    app.dependency_overrides[get_money_repo] = lambda: repo
    app.dependency_overrides[get_current_claims] = lambda: {"sub": user}
    return TestClient(app)


@pytest.fixture(autouse=True)
def _isolate():
    limiter.enabled = False
    yield
    app.dependency_overrides.clear()
    limiter.enabled = True
    limiter.reset()


def test_every_money_route_requires_a_token():
    app.dependency_overrides[get_money_repo] = lambda: FakeRepo()
    some = str(uuid.uuid4())
    with TestClient(app) as c:
        calls = [
            c.get(f"{BASE}/spends", params={"start": "2026-10-01", "end": "2026-10-31"}),
            c.post(f"{BASE}/spends", json=SPEND),
            c.delete(f"{BASE}/spends/{some}"),
            c.patch(f"{BASE}/spends/{some}", json={}),
            c.put(f"{BASE}/starting-money", json={"bank_paise": 0, "cash_paise": 0}),
            c.get(f"{BASE}/khata"),
            c.post(f"{BASE}/khata", json={}),
            c.post(f"{BASE}/khata/{some}/settle"),
            c.delete(f"{BASE}/khata/{some}"),
            c.get(f"{BASE}/subscriptions", params={"today": "2026-10-24"}),
            c.post(f"{BASE}/subscriptions", json={}),
            c.delete(f"{BASE}/subscriptions/{some}"),
            c.get(f"{BASE}/subscriptions/due", params={"today": "2026-10-24"}),
            c.post(f"{BASE}/subscriptions/{some}/cycles", json={}),
            c.get(f"{PROFILE}/trend", params={"today": "2026-10-24"}),
            c.get(f"{BASE}/summary"),
            c.get(NUDGES),
            c.put(NUDGES, json={}),
            c.get(f"{NUDGES}/plan"),
        ]
    assert [r.status_code for r in calls] == [401] * len(calls)


def test_log_spend_then_list_by_range():
    with _client(FakeRepo()) as c:
        created = c.post(f"{BASE}/spends", json=SPEND)
        assert created.status_code == 201
        rows = c.get(f"{BASE}/spends", params={"start": "2026-10-01", "end": "2026-10-31"}).json()
        nov = {"start": "2026-11-01", "end": "2026-11-30"}
        outside = c.get(f"{BASE}/spends", params=nov).json()
    assert [r["id"] for r in rows] == [created.json()["id"]]
    assert outside == []


def test_spend_range_rejects_reversed_and_over_62_inclusive_days():
    with _client(FakeRepo()) as c:
        reversed_ = c.get(f"{BASE}/spends", params={"start": "2026-10-10", "end": "2026-10-09"})
        too_long = c.get(f"{BASE}/spends", params={"start": "2026-01-01", "end": "2026-03-04"})
        ok = c.get(f"{BASE}/spends", params={"start": "2026-01-01", "end": "2026-03-03"})
    assert reversed_.status_code == 422
    assert too_long.status_code == 422  # 63 inclusive days
    assert ok.status_code == 200  # 62 inclusive days


@pytest.mark.parametrize("bad", [0, -1, 12.5, "100"])
def test_amount_must_be_positive_integer_paise(bad):
    with _client(FakeRepo()) as c:
        response = c.post(f"{BASE}/spends", json={**SPEND, "amount_paise": bad})
    assert response.status_code == 422


def test_user_b_cannot_delete_or_settle_user_a_rows():
    repo = FakeRepo()
    with _client(repo, USER_A) as c:
        spend_id = c.post(f"{BASE}/spends", json=SPEND).json()["id"]
        khata_id = c.post(
            f"{BASE}/khata", json={"direction": "lent", "person": "Ravi", "amount_paise": 500}
        ).json()["id"]
    with _client(repo, USER_B) as c:
        assert c.delete(f"{BASE}/spends/{spend_id}").status_code == 404
        edit = {"description": "X", "amount_paise": 1, "category": "food", "spent_on": "2026-10-20"}
        assert c.patch(f"{BASE}/spends/{spend_id}", json=edit).status_code == 404
        # B's balance never includes A's spends.
        c.put(f"{BASE}/starting-money", json={"bank_paise": 100, "cash_paise": 0})
        assert c.get(f"{BASE}/summary").json()["net_worth_paise"] == 100
        assert c.post(f"{BASE}/khata/{khata_id}/settle").status_code == 404
        assert c.delete(f"{BASE}/khata/{khata_id}").status_code == 404
    assert len(repo.live(USER_A, "expense")) == 1
    assert len(repo.khata[USER_A]) == 1 and not repo.settled


def test_summary_null_net_worth_until_starting_money_set():
    with _client(FakeRepo()) as c:
        before = c.get(f"{BASE}/summary").json()
        assert before["net_worth_paise"] is None
        assert before["starting_money"] is None
        assert before["owed_to_you_paise"] == 0 and before["you_owe_paise"] == 0


TODAY = datetime.now(IST).date().isoformat()


def test_net_worth_follows_the_ledger():
    with _client(FakeRepo()) as c:
        # Dated before the balance was set: already inside it ("Balance on").
        c.post(f"{BASE}/spends", json={**SPEND, "amount_paise": 999})
        c.put(f"{BASE}/starting-money", json={"bank_paise": 1000, "cash_paise": 50})
        c.post(f"{BASE}/spends", json={**SPEND, "amount_paise": 300, "spent_on": TODAY})
        # Lending moves cash out and adds a receivable; borrowing the reverse.
        c.post(f"{BASE}/khata", json={"direction": "lent", "person": "A", "amount_paise": 400})
        c.post(f"{BASE}/khata", json={"direction": "borrowed", "person": "B", "amount_paise": 100})
        s = c.get(f"{BASE}/summary").json()
        c.put(f"{BASE}/starting-money", json={"bank_paise": 700, "cash_paise": 50})
        after = c.get(f"{BASE}/summary").json()
    # Bank 1000 − 300; cash 50 − 400 + 100; plus 400 owed to you, less 100 you owe.
    assert s["starting_money"]["bank_paise"] == 700
    assert s["starting_money"]["cash_paise"] == -250
    assert s["balance_paise"] == 450
    assert (s["owed_to_you_paise"], s["you_owe_paise"]) == (400, 100)
    assert s["net_worth_paise"] == 1000 + 50 - 300  # lending and borrowing don't change it
    assert s["spent_since_update_paise"] == 0 and s["received_since_update_paise"] == 0
    # Typing 50 cash again is a +300 adjustment on Cash; bank already matched.
    assert after["starting_money"]["cash_paise"] == 50
    assert after["net_worth_paise"] == 700 + 50 + 400 - 100


def test_updating_the_balance_adds_dated_adjustments_not_new_openings():
    repo = FakeRepo()
    with _client(repo) as c:
        c.put(f"{BASE}/starting-money", json={"bank_paise": 1000, "cash_paise": 0})
        c.post(f"{BASE}/spends", json={**SPEND, "amount_paise": 300, "spent_on": TODAY})
        c.put(f"{BASE}/starting-money", json={"bank_paise": 900, "cash_paise": 0})
        s = c.get(f"{BASE}/summary").json()
    assert [a["name"] for a in repo.accounts] == ["Bank", "Cash"]
    assert len(repo.live(USER_A, "opening")) == 2
    [adj] = repo.live(USER_A, "adjustment")
    assert adj["amount_paise"] == 200 and adj["reason"] == "Balance updated"
    assert s["net_worth_paise"] == 900


def test_edit_spend_changes_fields_and_refuses_subscription_payments():
    repo = FakeRepo()
    with _client(repo) as c:
        spend = c.post(f"{BASE}/spends", json=SPEND).json()
        edited = c.patch(
            f"{BASE}/spends/{spend['id']}",
            json={"description": "Lunch", "amount_paise": 15000, "category": "food",
                  "spent_on": "2026-10-20"},
        )  # fmt: skip
        sub_spend = c.post(
            f"{BASE}/spends",
            json={**SPEND, "description": "Netflix", "category": "subscription", "billing_day": 24},
        ).json()
        refused = c.patch(
            f"{BASE}/spends/{sub_spend['id']}",
            json={"description": "X", "amount_paise": 1, "category": "food",
                  "spent_on": "2026-10-20"},
        )  # fmt: skip
        bad_cat = c.patch(
            f"{BASE}/spends/{spend['id']}",
            json={"description": "X", "amount_paise": 1, "category": "subscription",
                  "spent_on": "2026-10-20"},
        )  # fmt: skip
        missing = c.patch(
            f"{BASE}/spends/{uuid.uuid4()}",
            json={"description": "X", "amount_paise": 1, "category": "food",
                  "spent_on": "2026-10-20"},
        )  # fmt: skip
    assert edited.status_code == 200
    assert (edited.json()["description"], edited.json()["amount_paise"]) == ("Lunch", 15000)
    assert edited.json()["spent_on"] == "2026-10-20"
    assert refused.status_code == 404 and bad_cat.status_code == 422
    assert missing.status_code == 404


def _sub(name="Netflix", day=31, starts="2026-01-05", amount=19900):
    return {"name": name, "amount_paise": amount, "billing_day": day, "starts_on": starts}


def test_subscription_spend_requires_billing_day_and_creates_subscription():
    sub_spend = {**SPEND, "description": "Netflix", "category": "subscription"}
    with _client(FakeRepo()) as c:
        assert c.post(f"{BASE}/spends", json=sub_spend).status_code == 422
        assert c.post(f"{BASE}/spends", json={**SPEND, "billing_day": 5}).status_code == 422
        ok = c.post(f"{BASE}/spends", json={**sub_spend, "billing_day": 24})
        subs = c.get(f"{BASE}/subscriptions", params={"today": "2026-10-24"}).json()
    assert ok.status_code == 201 and ok.json()["category"] == "subscription"
    assert [(s["name"], s["billing_day"], s["starts_on"]) for s in subs] == [
        ("Netflix", 24, "2026-10-24")
    ]


def test_subscriptions_list_has_next_billing_sorted_inactive_last():
    repo = FakeRepo()
    with _client(repo) as c:
        for name, day in [("Late", 20), ("Feb31", 31), ("Early", 25)]:
            c.post(f"{BASE}/subscriptions", json=_sub(name, day))
        repo.subs[USER_A][0].active = False  # "Late"
        rows = c.get(f"{BASE}/subscriptions", params={"today": "2026-02-10"}).json()
        missing = c.get(f"{BASE}/subscriptions")
    assert [r["name"] for r in rows] == ["Early", "Feb31", "Late"]
    assert [r["next_billing_on"] for r in rows] == ["2026-02-25", "2026-02-28", None]
    assert missing.status_code == 422


def _due(c, today="2026-11-06"):
    return c.get(f"{BASE}/subscriptions/due", params={"today": today}).json()


def test_due_subscriptions_then_answer_yes_logs_once():
    repo = FakeRepo()
    with _client(repo) as c:
        sub_id = c.post(f"{BASE}/subscriptions", json=_sub(day=10, starts="2026-08-20")).json()["id"]
        due = _due(c)
        assert [(d["month"], d["billing_on"]) for d in due] == [
            ("2026-09-01", "2026-09-10"),
            ("2026-10-01", "2026-10-10"),
        ]
        assert due[0]["subscription_id"] == sub_id and due[0]["name"] == "Netflix"
        answer = {"month": "2026-09-01", "active": True}
        first = c.post(f"{BASE}/subscriptions/{sub_id}/cycles", json=answer)
        again = c.post(f"{BASE}/subscriptions/{sub_id}/cycles", json=answer)
        left = _due(c)
    assert (first.status_code, again.status_code) == (204, 204)
    assert [d["month"] for d in left] == ["2026-10-01"]
    logged = [t for t in repo.live(USER_A, "expense") if t["category"] == "subscriptions"]
    assert len(logged) == 1 and logged[0]["amount_paise"] == 19900


def test_deleting_a_logged_payment_reopens_its_month():
    repo = FakeRepo()
    with _client(repo) as c:
        sub_id = c.post(f"{BASE}/subscriptions", json=_sub(day=10, starts="2026-08-20")).json()["id"]
        c.post(f"{BASE}/subscriptions/{sub_id}/cycles", json={"month": "2026-09-01", "active": True})
        [paid] = repo.live(USER_A, "expense")
        assert c.delete(f"{BASE}/spends/{paid['id']}").status_code == 204
        due = _due(c)
    assert [d["month"] for d in due] == ["2026-09-01", "2026-10-01"]


def test_answer_no_deactivates_and_stops_prompting():
    repo = FakeRepo()
    with _client(repo) as c:
        sub_id = c.post(f"{BASE}/subscriptions", json=_sub(day=10, starts="2026-08-20")).json()["id"]
        no = {"month": "2026-09-01", "active": False}
        r = c.post(f"{BASE}/subscriptions/{sub_id}/cycles", json=no)
        due = _due(c)
    assert r.status_code == 204 and due == []
    assert not repo.live(USER_A, "expense")


def test_answer_cycle_404_for_other_user_and_422_for_bad_month():
    repo = FakeRepo()
    with _client(repo, USER_A) as c:
        sub_id = c.post(f"{BASE}/subscriptions", json=_sub()).json()["id"]
    body = {"month": "2026-09-01", "active": True}
    with _client(repo, USER_B) as c:
        assert c.post(f"{BASE}/subscriptions/{sub_id}/cycles", json=body).status_code == 404
    with _client(repo, USER_A) as c:
        bad = c.post(f"{BASE}/subscriptions/{sub_id}/cycles", json={**body, "month": "2026-09-02"})
    assert bad.status_code == 422
    assert not repo.live(USER_A, "expense")


def test_trend_is_30_points_ending_today_with_carry_forward():
    repo = FakeRepo()
    with _client(repo) as c:
        c.put(f"{BASE}/starting-money", json={"bank_paise": 1000, "cash_paise": 50})
        today = datetime.now(IST).date()
        pts = c.get(f"{PROFILE}/trend", params={"today": today.isoformat()}).json()
    assert len(pts) == 30
    assert pts[-1]["date"] == today.isoformat()
    assert pts[0]["date"] == (today - timedelta(days=29)).isoformat()
    assert pts[0]["balance_paise"] is None and pts[-1]["balance_paise"] == 1050


@pytest.mark.parametrize("path", ["trend", "nudges/plan"])
def test_invalid_tz_is_422(path):
    params = {"tz": "Mars/Phobos", "today": "2026-10-24"}
    with _client(FakeRepo()) as c:
        app.dependency_overrides[get_assessment_repo] = lambda: FakeAssessmentRepo(None)
        assert c.get(f"{PROFILE}/{path}", params=params).status_code == 422
        assert c.get(f"{PROFILE}/{path}", params={**params, "tz": "../x"}).status_code == 422


def _account_id(repo, name):
    return next(a["id"] for a in repo.accounts if a["name"] == name)


def test_lending_and_settling_move_money_but_not_net_worth():
    repo = FakeRepo()
    with _client(repo) as c:
        c.put(f"{BASE}/starting-money", json={"bank_paise": 1000, "cash_paise": 500})
        body = {"direction": "lent", "person": "A", "amount_paise": 400}
        entry = c.post(f"{BASE}/khata", json=body)
        assert entry.status_code == 201
        before = c.get(f"{BASE}/summary").json()
        assert c.post(f"{BASE}/khata/{entry.json()['id']}/settle").status_code == 204
        assert c.get(f"{BASE}/khata").json() == []
        s = c.get(f"{BASE}/summary").json()
        spends = c.get(f"{BASE}/spends", params={"start": TODAY, "end": TODAY}).json()
    # Lent from Cash (the chip's default): cash down, receivable up.
    assert before["starting_money"]["cash_paise"] == 100
    assert before["owed_to_you_paise"] == 400 and before["net_worth_paise"] == 1500
    # Paid back with no method given: into the bank. Not income.
    assert s["starting_money"]["bank_paise"] == 1400 and s["owed_to_you_paise"] == 0
    assert s["net_worth_paise"] == s["balance_paise"] == 1500
    assert spends == []


def test_paying_back_borrowed_money_is_a_repayment_not_a_spend():
    repo = FakeRepo()
    with _client(repo) as c:
        c.put(f"{BASE}/starting-money", json={"bank_paise": 1000, "cash_paise": 0})
        body = {"direction": "borrowed", "person": "Ravi", "amount_paise": 300}
        entry = c.post(f"{BASE}/khata", json=body).json()
        before = c.get(f"{BASE}/summary").json()
        settled = c.post(f"{BASE}/khata/{entry['id']}/settle", json={"method": "upi"})
        s = c.get(f"{BASE}/summary").json()
        # A repeat settle is a 404 and moves nothing more.
        assert c.post(f"{BASE}/khata/{entry['id']}/settle").status_code == 404
        # Unknown payment methods are refused; "cash" pays from Cash.
        other = c.post(f"{BASE}/khata", json={**body, "person": "Asha"}).json()
        bad = c.post(f"{BASE}/khata/{other['id']}/settle", json={"method": "cheque"})
        cash = c.post(f"{BASE}/khata/{other['id']}/settle", json={"method": "cash"})
    assert settled.status_code == 204 and bad.status_code == 422 and cash.status_code == 204
    assert not repo.live(USER_A, "expense")
    paid = repo.live(USER_A, "repayment_made")
    assert [t["account_id"] for t in paid] == [_account_id(repo, "Bank"), _account_id(repo, "Cash")]
    assert before["you_owe_paise"] == 300 and before["net_worth_paise"] == 1000
    assert s["you_owe_paise"] == 0 and s["net_worth_paise"] == 1000
    assert s["starting_money"]["bank_paise"] == 700


def test_khata_account_chip_and_retry():
    repo = FakeRepo()
    with _client(repo, USER_B) as c:
        c.put(f"{BASE}/starting-money", json={"bank_paise": 100, "cash_paise": 0})
    theirs = _account_id(repo, "Bank")
    with _client(repo) as c:
        c.put(f"{BASE}/starting-money", json={"bank_paise": 1000, "cash_paise": 0})
        bank = next(a["id"] for a in repo.accounts if a["user_id"] == USER_A and a["name"] == "Bank")
        k = key()
        body = {"direction": "lent", "person": "A", "amount_paise": 200, "account_id": bank,
                "client_key": k}  # fmt: skip
        first = c.post(f"{BASE}/khata", json=body)
        again = c.post(f"{BASE}/khata", json=body)
        wrong = c.post(f"{BASE}/khata", json={**body, "client_key": key(), "account_id": theirs})
        settle = c.post(f"{BASE}/khata/{first.json()['id']}/settle", json={"account_id": theirs})
        s = c.get(f"{BASE}/summary").json()
    assert first.status_code == 201 and first.json()["id"] == again.json()["id"]
    assert len(repo.khata[USER_A]) == 1
    assert wrong.status_code == 422 and settle.status_code == 422
    assert s["starting_money"]["bank_paise"] == 800 and s["owed_to_you_paise"] == 200


def test_khata_before_any_balance_still_counts_what_is_owed():
    with _client(FakeRepo()) as c:
        c.post(f"{BASE}/khata", json={"direction": "lent", "person": "A", "amount_paise": 400})
        s = c.get(f"{BASE}/summary").json()
    assert s["starting_money"] is None and s["net_worth_paise"] is None
    assert s["owed_to_you_paise"] == 400


def test_spends_from_the_old_app_land_on_the_bank_account():
    repo = FakeRepo()
    with _client(repo) as c:
        c.put(f"{BASE}/starting-money", json={"bank_paise": 1000, "cash_paise": 100})
        spend = c.post(f"{BASE}/spends", json={**SPEND, "spent_on": TODAY}).json()
        listed = c.get(f"{BASE}/spends", params={"start": TODAY, "end": TODAY}).json()
    [row] = repo.live(USER_A, "expense")
    assert row["account_id"] == _account_id(repo, "Bank") and row["category"] == "food_delivery"
    assert spend["category"] == "food" and [x["id"] for x in listed] == [spend["id"]]


def test_delete_returns_204_then_404_and_bad_id_is_422():
    with _client(FakeRepo()) as c:
        sub_id = c.post(f"{BASE}/subscriptions", json=_sub()).json()["id"]
        assert c.delete(f"{BASE}/subscriptions/{sub_id}").status_code == 204
        assert c.delete(f"{BASE}/subscriptions/{sub_id}").status_code == 404
        assert c.delete(f"{BASE}/subscriptions/not-a-uuid").status_code == 422
        assert c.get(f"{BASE}/assets").status_code == 404


def test_nudges_round_trip():
    with _client(FakeRepo()) as c:
        assert c.get(NUDGES).json() == {"pre_spend": True, "patterns": True, "weekly": True}
        put = c.put(NUDGES, json={"pre_spend": False, "patterns": True, "weekly": False})
        assert put.status_code == 200
        assert c.get(NUDGES).json() == {"pre_spend": False, "patterns": True, "weekly": False}


def test_store_failure_is_503():
    with _client(BrokenRepo()) as c:
        response = c.get(f"{BASE}/spends", params={"start": "2026-10-01", "end": "2026-10-31"})
    assert response.status_code == 503
    assert response.json() == {
        "detail": "Something went wrong on our side. Please try again in a moment.",
        "code": "server_unavailable",
    }


@pytest.mark.parametrize("today", ["9999-12-31", "1999-12-31", "2101-01-01"])
def test_subscriptions_today_is_bounded(today):
    with _client(FakeRepo()) as c:
        for path in [f"{BASE}/subscriptions", f"{BASE}/subscriptions/due", f"{PROFILE}/trend"]:
            assert c.get(path, params={"today": today}).status_code == 422


@pytest.mark.parametrize("due", ["0001-01-01", "1999-12-31", "2101-01-01"])
def test_subscription_start_date_is_bounded(due):
    body = _sub(starts=due)
    with _client(FakeRepo()) as c:
        assert c.post(f"{BASE}/subscriptions", json=body).status_code == 422


class FakeAssessmentRepo:
    def __init__(self, primary: str | None = None) -> None:
        self.primary = primary

    async def get_latest_result(self, user_id):
        return None if self.primary is None else type("S", (), {"primary": self.primary})()


def _seed_pattern(repo: FakeRepo) -> None:
    today = datetime.now(IST).date()
    for i in range(3):
        stamp = now()
        repo.txns.append(
            {
                "id": key(), "user_id": USER_A, "client_key": key(), "type": "expense",
                "amount_paise": 30000, "account_id": None, "to_account_id": None,
                "category": "food_delivery", "description": "Zomato", "note": None,
                "reason": None, "khata_entry_id": None, "refund_of": None,
                "occurred_on": (today - timedelta(days=i)).isoformat(), "source": "legacy",
                "deleted_at": None, "created_at": stamp, "updated_at": stamp,
            }
        )  # fmt: skip


def test_nudge_plan_returns_pattern_nudge_with_archetype_copy():
    repo = FakeRepo()
    _seed_pattern(repo)
    with _client(repo) as c:
        app.dependency_overrides[get_assessment_repo] = lambda: FakeAssessmentRepo("optimizer")
        body = c.get(f"{NUDGES}/plan").json()
    assert len(body) >= 1 and body[0]["kind"] == "pattern"
    assert set(body[0]) == {"id", "kind", "title", "body", "fire_at"}
    assert body[0]["id"].startswith("pattern:zomato:")
    assert "₹900" in body[0]["body"] or "₹900" in body[0]["title"]
    assert body[0]["fire_at"].endswith("+05:30")


def test_nudge_plan_without_assessment_or_spends():
    with _client(FakeRepo()) as c:
        app.dependency_overrides[get_assessment_repo] = lambda: FakeAssessmentRepo(None)
        assert c.get(f"{NUDGES}/plan").json() == []
    repo = FakeRepo()
    _seed_pattern(repo)
    with _client(repo) as c:
        app.dependency_overrides[get_assessment_repo] = lambda: FakeAssessmentRepo(None)
        assert c.get(f"{NUDGES}/plan").json()[0]["kind"] == "pattern"  # default copy


def _plan(repo: FakeRepo, user: str = USER_A) -> list:
    with _client(repo, user) as c:
        app.dependency_overrides[get_assessment_repo] = lambda: FakeAssessmentRepo(None)
        return c.get(f"{NUDGES}/plan").json()


def test_nudge_plan_is_scoped_to_the_caller():
    repo = FakeRepo()
    _seed_pattern(repo)
    assert _plan(repo, USER_B) == []
    assert _plan(repo, USER_A)


def test_nudge_plan_empty_when_both_prefs_off():
    repo = FakeRepo()
    _seed_pattern(repo)
    repo.nudges[USER_A] = Nudges(pre_spend=False, patterns=False, weekly=True)
    assert _plan(repo) == []


def test_nudge_plan_reads_last_28_days_in_the_requested_zone():
    repo = FakeRepo()
    with _client(repo) as c:
        app.dependency_overrides[get_assessment_repo] = lambda: FakeAssessmentRepo(None)
        assert c.get(f"{NUDGES}/plan", params={"tz": "Pacific/Kiritimati"}).status_code == 200
    today = datetime.now(ZoneInfo("Pacific/Kiritimati")).date()
    assert repo.list_calls == [(USER_A, today - timedelta(days=27), today)]


def test_nudge_plan_loads_archetype_and_default_templates():
    repo = FakeRepo()
    with _client(repo) as c:
        app.dependency_overrides[get_assessment_repo] = lambda: FakeAssessmentRepo("optimizer")
        c.get(f"{NUDGES}/plan")
        app.dependency_overrides[get_assessment_repo] = lambda: FakeAssessmentRepo(None)
        c.get(f"{NUDGES}/plan")
    assert repo.template_calls == [["optimizer", "default"], ["default"]]


def test_nudge_plan_adds_subscription_nudge_with_next_billing_on():
    repo = FakeRepo()
    with _client(repo) as c:
        app.dependency_overrides[get_assessment_repo] = lambda: FakeAssessmentRepo(None)
        tomorrow = datetime.now(IST).date() + timedelta(days=1)
        sub = c.post(f"{BASE}/subscriptions", json=_sub(day=tomorrow.day)).json()
        body = c.get(f"{NUDGES}/plan").json()
    assert any(n["id"].startswith(f"subscription:{sub['id']}:") for n in body)


def test_subscription_spend_description_over_60_is_422_not_503():
    body = {**SPEND, "description": "x" * 61, "category": "subscription", "billing_day": 5}
    with _client(FakeRepo()) as c:
        assert c.post(f"{BASE}/spends", json=body).status_code == 422


def test_spend_date_and_cycle_month_are_bounded():
    with _client(FakeRepo()) as c:
        assert c.post(f"{BASE}/spends", json={**SPEND, "spent_on": "9999-12-31"}).status_code == 422
        sub_id = c.post(f"{BASE}/subscriptions", json=_sub()).json()["id"]
        far = {"month": "2101-01-01", "active": True}
        assert c.post(f"{BASE}/subscriptions/{sub_id}/cycles", json=far).status_code == 422


def test_next_billing_on_ignores_answered_cycles():
    repo = FakeRepo()
    with _client(repo) as c:
        c.post(
            f"{BASE}/spends",
            json={**SPEND, "description": "Netflix", "category": "subscription",
                  "spent_on": "2026-11-06", "billing_day": 20},
        )  # fmt: skip
        got = c.get(f"{BASE}/subscriptions", params={"today": "2026-11-06"}).json()
    assert got[0]["next_billing_on"] == "2026-12-20"


def test_answering_yes_on_billing_day_moves_next_billing_on():
    repo = FakeRepo()
    with _client(repo) as c:
        sub_id = c.post(f"{BASE}/subscriptions", json=_sub(day=6, starts="2026-08-01")).json()["id"]
        before = c.get(f"{BASE}/subscriptions", params={"today": "2026-11-06"}).json()
        c.post(f"{BASE}/subscriptions/{sub_id}/cycles", json={"month": "2026-11-01", "active": True})
        after = c.get(f"{BASE}/subscriptions", params={"today": "2026-11-06"}).json()
    assert before[0]["next_billing_on"] == "2026-11-06"
    assert after[0]["next_billing_on"] == "2026-12-06"


def test_added_today_with_billing_day_today_is_not_due_today():
    with _client(FakeRepo()) as c:
        c.post(f"{BASE}/subscriptions", json=_sub(day=6, starts="2026-11-06"))
        got = c.get(f"{BASE}/subscriptions", params={"today": "2026-11-06"}).json()
        assert _due(c) == []
    assert got[0]["next_billing_on"] == "2026-12-06"


def test_answer_yes_logs_the_clamped_billing_date():
    repo = FakeRepo()
    with _client(repo) as c:
        sub_id = c.post(f"{BASE}/subscriptions", json=_sub(day=31, starts="2026-01-05")).json()["id"]
        c.post(f"{BASE}/subscriptions/{sub_id}/cycles", json={"month": "2026-02-01", "active": True})
    assert [t["occurred_on"] for t in repo.live(USER_A, "expense")] == ["2026-02-28"]


def test_duplicate_active_subscription_name_is_409():
    with _client(FakeRepo()) as c:
        assert c.post(f"{BASE}/subscriptions", json=_sub("Netflix")).status_code == 201
        dup = c.post(f"{BASE}/subscriptions", json=_sub(" netflix "))
    assert dup.status_code == 409
    assert "already" in dup.json()["detail"]


def test_nudge_plan_skips_subscription_nudge_for_an_answered_cycle():
    repo = FakeRepo()
    tomorrow = datetime.now(IST).date() + timedelta(days=1)
    with _client(repo) as c:
        app.dependency_overrides[get_assessment_repo] = lambda: FakeAssessmentRepo(None)
        sub = c.post(f"{BASE}/subscriptions", json=_sub(day=tomorrow.day)).json()
        repo.cycles.setdefault(USER_A, {})[sub["id"]] = {tomorrow.replace(day=1): None}
        body = c.get(f"{NUDGES}/plan").json()
    assert not any(n["kind"] == "subscription" for n in body)


def test_nudge_plan_keeps_subscription_nudges_when_templates_fail():
    repo = FakeRepo()
    repo.templates_fail = True
    with _client(repo) as c:
        app.dependency_overrides[get_assessment_repo] = lambda: FakeAssessmentRepo(None)
        tomorrow = datetime.now(IST).date() + timedelta(days=1)
        c.post(f"{BASE}/subscriptions", json=_sub(day=tomorrow.day))
        resp = c.get(f"{NUDGES}/plan")
    assert resp.status_code == 200
    assert [n["kind"] for n in resp.json()] == ["subscription"]
