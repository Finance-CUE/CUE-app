"""Money repository checks against a mocked PostgREST. No network.

Run: cd apps/backend && python -m pytest tests/test_money_repository.py -v
"""

import asyncio
import json
from datetime import UTC, date, datetime

import httpx
import pytest

from app.core.config import get_settings
from app.features.money.repository import MoneyRepository, MoneyStoreError
from app.features.money.schemas import NudgesPut, SpendCreate, StartingMoneyPut

USER = "11111111-1111-4111-8111-111111111111"
ROW_ID = "22222222-2222-4222-8222-222222222222"
SPEND_ROW = {
    "id": ROW_ID,
    "description": "coffee",
    "amount_paise": 21000,
    "category": "food",
    "spent_on": "2026-10-24",
    "created_at": "2026-10-24T08:00:00+00:00",
}


def _run(handler, action):
    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await action(MoneyRepository(get_settings(), client))

    return asyncio.run(go())


def test_add_spend_posts_user_id_from_argument_not_payload():
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(201, json=[SPEND_ROW])

    data = SpendCreate(
        description="coffee", amount_paise=21000, category="food", spent_on=date(2026, 10, 24)
    )
    spend = _run(handler, lambda repo: repo.add_spend(USER, data))

    body = json.loads(seen[0].content)
    assert body["user_id"] == USER
    assert body["spent_on"] == "2026-10-24"
    assert "return=representation" in seen[0].headers["prefer"]
    assert seen[0].url.path == "/rest/v1/spends"
    assert spend.id == ROW_ID and spend.amount_paise == 21000


def test_list_spends_filters_user_and_inclusive_range():
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=[SPEND_ROW])

    start, end = date(2026, 10, 1), date(2026, 10, 31)
    spends = _run(handler, lambda repo: repo.list_spends(USER, start, end))

    params = seen[0].url.params
    assert params["user_id"] == f"eq.{USER}"
    assert params["and"] == "(spent_on.gte.2026-10-01,spent_on.lte.2026-10-31)"
    assert params["order"] == "spent_on.desc,created_at.desc,id.asc"
    assert len(spends) == 1


def test_delete_is_scoped_to_user_and_reports_miss():
    seen: list[httpx.Request] = []
    rows: list = [[], [{"id": ROW_ID}]]

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=rows.pop(0))

    assert _run(handler, lambda repo: repo.delete_spend(USER, ROW_ID)) is False
    assert _run(handler, lambda repo: repo.delete_spend(USER, ROW_ID)) is True
    assert seen[0].method == "DELETE"
    assert seen[0].url.params["id"] == f"eq.{ROW_ID}"
    assert seen[0].url.params["user_id"] == f"eq.{USER}"


def test_settle_only_touches_open_entries():
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=[{"id": ROW_ID}])

    assert _run(handler, lambda repo: repo.settle_khata(USER, ROW_ID)) is True

    request = seen[0]
    assert request.method == "PATCH"
    assert request.url.path == "/rest/v1/khata_entries"
    assert request.url.params["settled_at"] == "is.null"
    assert request.url.params["user_id"] == f"eq.{USER}"
    assert request.url.params["id"] == f"eq.{ROW_ID}"
    assert "settled_at" in json.loads(request.content)


def test_list_open_khata_filters_unsettled():
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=[])

    assert _run(handler, lambda repo: repo.list_open_khata(USER)) == []
    assert seen[0].url.params["settled_at"] == "is.null"
    assert seen[0].url.params["user_id"] == f"eq.{USER}"
    assert seen[0].url.params["order"] == "created_at.desc,id.asc"


def test_put_starting_money_keeps_set_at_on_update():
    seen: list[httpx.Request] = []
    existing = {"bank_paise": 1, "cash_paise": 2, "set_at": "2026-10-01T00:00:00+00:00"}

    def handler(request):
        seen.append(request)
        if request.method == "GET":
            return httpx.Response(200, json=[existing])
        return httpx.Response(200, json=[{**existing, "bank_paise": 500, "cash_paise": 0}])

    data = StartingMoneyPut(bank_paise=500, cash_paise=0)
    result = _run(handler, lambda repo: repo.put_starting_money(USER, data))

    write = seen[-1]
    assert write.method == "PATCH"
    assert write.url.params["user_id"] == f"eq.{USER}"
    assert set(json.loads(write.content)) == {"bank_paise", "cash_paise"}
    assert result.bank_paise == 500
    assert result.set_at == datetime(2026, 10, 1, tzinfo=UTC)


def test_put_starting_money_inserts_first_time_tolerating_duplicates():
    seen: list[httpx.Request] = []
    row = {"bank_paise": 500, "cash_paise": 0, "set_at": "2026-10-24T00:00:00+00:00"}

    def handler(request):
        seen.append(request)
        if request.method == "GET":
            return httpx.Response(200, json=[])
        return httpx.Response(200, json=[row] if request.method == "PATCH" else [])

    result = _run(
        handler,
        lambda repo: repo.put_starting_money(
            USER, StartingMoneyPut(bank_paise=500, cash_paise=0)
        ),
    )

    post, patch = seen[-2], seen[-1]
    assert post.method == "POST"
    assert post.url.params["on_conflict"] == "user_id"
    assert "resolution=ignore-duplicates" in post.headers["Prefer"]
    body = json.loads(post.content)
    assert body["user_id"] == USER
    assert "set_at" not in body
    assert patch.method == "PATCH"
    assert set(json.loads(patch.content)) == {"bank_paise", "cash_paise"}
    assert result.bank_paise == 500


def test_empty_write_response_is_a_store_error_not_index_error():
    def handler(request):
        return httpx.Response(201, json=[])

    with pytest.raises(MoneyStoreError):
        _run(handler, lambda repo: repo.put_nudges(
            USER, NudgesPut(pre_spend=True, patterns=True, weekly=True)
        ))
    with pytest.raises(MoneyStoreError):
        _run(handler, lambda repo: repo.add_spend(
            USER,
            SpendCreate(
                description="x", amount_paise=1, category="food", spent_on="2026-10-24"
            ),
        ))


def test_sum_spends_since_adds_amounts():
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=[{"amount_paise": 100}, {"amount_paise": 250}])

    since = datetime(2026, 10, 1, tzinfo=UTC)
    assert _run(handler, lambda repo: repo.sum_spends_since(USER, since)) == 350
    assert seen[0].url.params["created_at"] == f"gte.{since.isoformat()}"
    assert seen[0].url.params["user_id"] == f"eq.{USER}"


def test_sum_spends_since_pages_past_the_row_cap():
    seen: list[httpx.Request] = []
    pages = [[{"amount_paise": 1}] * 1000, [{"amount_paise": 5}]]

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=pages.pop(0))

    since = datetime(2026, 10, 1, tzinfo=UTC)
    assert _run(handler, lambda repo: repo.sum_spends_since(USER, since)) == 1005
    assert len(seen) == 2
    assert [r.url.params["offset"] for r in seen] == ["0", "1000"]
    assert all(r.url.params["limit"] == "1000" for r in seen)
    assert seen[0].url.params["order"] == "id.asc"


def test_list_methods_page_until_partial_page():
    seen: list[httpx.Request] = []
    pages = [[SPEND_ROW] * 1000, [SPEND_ROW]]

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=pages.pop(0))

    start, end = date(2026, 10, 1), date(2026, 10, 31)
    spends = _run(handler, lambda repo: repo.list_spends(USER, start, end))
    assert len(spends) == 1001
    assert seen[1].url.params["offset"] == "1000"
    assert seen[1].url.params["user_id"] == f"eq.{USER}"


def test_nudges_read_and_write_the_users_row():
    seen: list[httpx.Request] = []
    row = {"nudge_pre_spend": False, "nudge_patterns": True, "nudge_weekly": True}

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=[row])

    nudges = _run(handler, lambda repo: repo.get_nudges(USER))
    assert (nudges.pre_spend, nudges.patterns, nudges.weekly) == (False, True, True)
    assert seen[0].url.params["id"] == f"eq.{USER}"

    data = NudgesPut(pre_spend=False, patterns=True, weekly=True)
    _run(handler, lambda repo: repo.put_nudges(USER, data))
    assert seen[1].method == "PATCH"
    assert json.loads(seen[1].content) == row


def test_non_uuid_ids_raise_before_any_request():
    def handler(request):
        raise AssertionError("no request should be sent")

    with pytest.raises(ValueError):
        _run(handler, lambda repo: repo.delete_spend(USER, "1;drop"))
    with pytest.raises(ValueError):
        _run(handler, lambda repo: repo.settle_khata("bad", ROW_ID))


def test_http_failure_becomes_store_error():
    def handler(request):
        return httpx.Response(500, json={"message": "secret database detail"})

    with pytest.raises(MoneyStoreError) as exc_info:
        _run(handler, lambda repo: repo.list_assets(USER))

    assert "secret" not in str(exc_info.value)
