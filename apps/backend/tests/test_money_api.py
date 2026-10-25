"""Money and profile API checks with an in-memory repository and a faked identity.

Run: cd apps/backend && python -m pytest tests/test_money_api.py -v
"""

import uuid
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_claims
from app.features.auth.router import limiter
from app.features.money.repository import MoneyStoreError
from app.features.money.router import get_money_repo
from app.features.money.schemas import (
    Asset,
    KhataEntry,
    Nudges,
    Spend,
    StartingMoney,
    Subscription,
)
from app.main import app

USER_A = "11111111-1111-4111-8111-111111111111"
USER_B = "22222222-2222-4222-8222-222222222222"

BASE = "/api/v1/money"
NUDGES = "/api/v1/profile/nudges"

SPEND = {"description": "Chai", "amount_paise": 2000, "category": "food", "spent_on": "2026-10-24"}


def _now() -> datetime:
    return datetime.now(UTC)


class FakeRepo:
    def __init__(self) -> None:
        self.spends: dict[str, list[Spend]] = {}
        self.starting: dict[str, StartingMoney] = {}
        self.khata: dict[str, list[KhataEntry]] = {}
        self.settled: set[str] = set()
        self.subs: dict[str, list[Subscription]] = {}
        self.assets: dict[str, list[Asset]] = {}
        self.nudges: dict[str, Nudges] = {}

    @staticmethod
    def _drop(rows: list, entity_id: str) -> bool:
        for row in rows:
            if row.id == entity_id:
                rows.remove(row)
                return True
        return False

    async def add_spend(self, user_id, data):
        spend = Spend(id=str(uuid.uuid4()), created_at=_now(), **data.model_dump())
        self.spends.setdefault(user_id, []).append(spend)
        return spend

    async def list_spends(self, user_id, start, end):
        return [s for s in self.spends.get(user_id, []) if start <= s.spent_on <= end]

    async def delete_spend(self, user_id, spend_id):
        return self._drop(self.spends.get(user_id, []), spend_id)

    async def sum_spends_since(self, user_id, since):
        return sum(s.amount_paise for s in self.spends.get(user_id, []) if s.created_at >= since)

    async def get_starting_money(self, user_id):
        return self.starting.get(user_id)

    async def put_starting_money(self, user_id, data):
        old = self.starting.get(user_id)
        row = StartingMoney(set_at=old.set_at if old else _now(), **data.model_dump())
        self.starting[user_id] = row
        return row

    async def list_open_khata(self, user_id):
        return [k for k in self.khata.get(user_id, []) if k.id not in self.settled]

    async def add_khata(self, user_id, data):
        entry = KhataEntry(id=str(uuid.uuid4()), created_at=_now(), **data.model_dump())
        self.khata.setdefault(user_id, []).append(entry)
        return entry

    async def settle_khata(self, user_id, entry_id):
        if any(k.id == entry_id for k in await self.list_open_khata(user_id)):
            self.settled.add(entry_id)
            return True
        return False

    async def delete_khata(self, user_id, entry_id):
        return self._drop(self.khata.get(user_id, []), entry_id)

    async def list_subscriptions(self, user_id):
        return list(self.subs.get(user_id, []))

    async def add_subscription(self, user_id, data):
        sub = Subscription(id=str(uuid.uuid4()), created_at=_now(), **data.model_dump())
        self.subs.setdefault(user_id, []).append(sub)
        return sub

    async def delete_subscription(self, user_id, sub_id):
        return self._drop(self.subs.get(user_id, []), sub_id)

    async def list_assets(self, user_id):
        return list(self.assets.get(user_id, []))

    async def add_asset(self, user_id, data):
        asset = Asset(id=str(uuid.uuid4()), created_at=_now(), **data.model_dump())
        self.assets.setdefault(user_id, []).append(asset)
        return asset

    async def delete_asset(self, user_id, asset_id):
        return self._drop(self.assets.get(user_id, []), asset_id)

    async def get_nudges(self, user_id):
        return self.nudges.get(user_id, Nudges(pre_spend=True, patterns=True, weekly=True))

    async def put_nudges(self, user_id, data):
        self.nudges[user_id] = Nudges(**data.model_dump())
        return self.nudges[user_id]


class BrokenRepo:
    async def list_spends(self, user_id, start, end):
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
            c.put(f"{BASE}/starting-money", json={"bank_paise": 0, "cash_paise": 0}),
            c.get(f"{BASE}/khata"),
            c.post(f"{BASE}/khata", json={}),
            c.post(f"{BASE}/khata/{some}/settle"),
            c.delete(f"{BASE}/khata/{some}"),
            c.get(f"{BASE}/subscriptions", params={"today": "2026-10-24"}),
            c.post(f"{BASE}/subscriptions", json={}),
            c.delete(f"{BASE}/subscriptions/{some}"),
            c.get(f"{BASE}/assets"),
            c.post(f"{BASE}/assets", json={}),
            c.delete(f"{BASE}/assets/{some}"),
            c.get(f"{BASE}/summary"),
            c.get(NUDGES),
            c.put(NUDGES, json={}),
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
        assert c.post(f"{BASE}/khata/{khata_id}/settle").status_code == 404
        assert c.delete(f"{BASE}/khata/{khata_id}").status_code == 404
    assert len(repo.spends[USER_A]) == 1
    assert len(repo.khata[USER_A]) == 1 and not repo.settled


def test_summary_null_net_worth_until_starting_money_set():
    with _client(FakeRepo()) as c:
        before = c.get(f"{BASE}/summary").json()
        assert before["net_worth_paise"] is None
        assert before["starting_money"] is None
        assert before["owed_to_you_paise"] == 0 and before["you_owe_paise"] == 0

        put = c.put(f"{BASE}/starting-money", json={"bank_paise": 10000, "cash_paise": 500})
        assert put.status_code == 200
        c.post(f"{BASE}/spends", json={**SPEND, "amount_paise": 300})
        after = c.get(f"{BASE}/summary").json()
    assert after["net_worth_paise"] == 10000 + 500 - 300


def test_summary_counts_assets_and_open_khata():
    with _client(FakeRepo()) as c:
        c.put(f"{BASE}/starting-money", json={"bank_paise": 1000, "cash_paise": 0})
        c.post(f"{BASE}/assets", json={"name": "Gold", "value_paise": 5000})
        c.post(f"{BASE}/khata", json={"direction": "lent", "person": "A", "amount_paise": 400})
        c.post(f"{BASE}/khata", json={"direction": "borrowed", "person": "B", "amount_paise": 100})
        s = c.get(f"{BASE}/summary").json()
    assert s["net_worth_paise"] == 1000 + 5000 + 400 - 100
    assert (s["owed_to_you_paise"], s["you_owe_paise"]) == (400, 100)


def test_editing_starting_money_keeps_counting_earlier_spends():
    with _client(FakeRepo()) as c:
        c.put(f"{BASE}/starting-money", json={"bank_paise": 1000, "cash_paise": 0})
        c.post(f"{BASE}/spends", json={**SPEND, "amount_paise": 100})
        c.put(f"{BASE}/starting-money", json={"bank_paise": 2000, "cash_paise": 50})
        s = c.get(f"{BASE}/summary").json()
    assert s["net_worth_paise"] == 2000 + 50 - 100


def test_subscriptions_roll_forward_with_client_today():
    with _client(FakeRepo()) as c:
        c.post(
            f"{BASE}/subscriptions",
            json={
                "name": "Netflix",
                "amount_paise": 19900,
                "cadence": "monthly",
                "next_due_on": "2026-01-31",
            },
        )
        rows = c.get(f"{BASE}/subscriptions", params={"today": "2026-03-01"})
        missing = c.get(f"{BASE}/subscriptions")
    assert rows.json()[0]["next_due_on"] == "2026-03-31"
    assert missing.status_code == 422


def test_subscriptions_sorted_by_rolled_due_date():
    with _client(FakeRepo()) as c:
        for name, due in [("Late", "2026-11-20"), ("Early", "2026-10-25")]:
            c.post(
                f"{BASE}/subscriptions",
                json={"name": name, "amount_paise": 100, "cadence": "monthly", "next_due_on": due},
            )
        rows = c.get(f"{BASE}/subscriptions", params={"today": "2026-10-24"}).json()
        names = [r["name"] for r in rows]
    assert names == ["Early", "Late"]


def test_settled_khata_leaves_list_and_summary():
    with _client(FakeRepo()) as c:
        c.put(f"{BASE}/starting-money", json={"bank_paise": 1000, "cash_paise": 0})
        body = {"direction": "lent", "person": "A", "amount_paise": 400}
        entry = c.post(f"{BASE}/khata", json=body)
        assert entry.status_code == 201
        assert c.post(f"{BASE}/khata/{entry.json()['id']}/settle").status_code == 204
        assert c.get(f"{BASE}/khata").json() == []
        s = c.get(f"{BASE}/summary").json()
    assert s["owed_to_you_paise"] == 0
    assert s["net_worth_paise"] == 1000


def test_delete_returns_204_then_404_and_bad_id_is_422():
    with _client(FakeRepo()) as c:
        asset_id = c.post(f"{BASE}/assets", json={"name": "Bike", "value_paise": 100}).json()["id"]
        assert c.delete(f"{BASE}/assets/{asset_id}").status_code == 204
        assert c.delete(f"{BASE}/assets/{asset_id}").status_code == 404
        assert c.delete(f"{BASE}/assets/not-a-uuid").status_code == 422


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
    assert response.json() == {"detail": "Money service unavailable."}


@pytest.mark.parametrize("today", ["9999-12-31", "1999-12-31", "2101-01-01"])
def test_subscriptions_today_is_bounded(today):
    with _client(FakeRepo()) as c:
        assert c.get(f"{BASE}/subscriptions", params={"today": today}).status_code == 422


@pytest.mark.parametrize("due", ["0001-01-01", "1999-12-31", "2101-01-01"])
def test_subscription_due_date_is_bounded(due):
    body = {"name": "N", "amount_paise": 100, "cadence": "monthly", "next_due_on": due}
    with _client(FakeRepo()) as c:
        assert c.post(f"{BASE}/subscriptions", json=body).status_code == 422
