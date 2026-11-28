"""Money repository checks against a mocked PostgREST. No network.

Spends, balances, settling and subscription payments are on the ledger: see
test_ledger_repository.py.

Run: cd apps/backend && python -m pytest tests/test_money_repository.py -v
"""

import asyncio
import json
from datetime import date

import httpx
import pytest

from app.core.config import get_settings
from app.features.money.repository import MoneyConflictError, MoneyRepository, MoneyStoreError
from app.features.money.schemas import NudgesPut, SubscriptionCreate

USER = "11111111-1111-4111-8111-111111111111"
ROW_ID = "22222222-2222-4222-8222-222222222222"
KHATA_ROW = {
    "id": ROW_ID,
    "direction": "lent",
    "person": "A",
    "amount_paise": 5,
    "note": None,
    "created_at": "2026-10-24T08:00:00+00:00",
}


def _run(handler, action):
    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await action(MoneyRepository(get_settings(), client))

    return asyncio.run(go())


def test_delete_is_scoped_to_user_and_reports_miss():
    seen: list[httpx.Request] = []
    rows: list = [[], [{"id": ROW_ID}]]

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=rows.pop(0))

    assert _run(handler, lambda repo: repo.delete_khata(USER, ROW_ID)) is False
    assert _run(handler, lambda repo: repo.delete_khata(USER, ROW_ID)) is True
    assert seen[0].method == "DELETE"
    assert seen[0].url.path == "/rest/v1/khata_entries"
    assert seen[0].url.params["id"] == f"eq.{ROW_ID}"
    assert seen[0].url.params["user_id"] == f"eq.{USER}"


def test_list_open_khata_filters_unsettled():
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=[])

    assert _run(handler, lambda repo: repo.list_open_khata(USER)) == []
    assert seen[0].url.params["settled_at"] == "is.null"
    assert seen[0].url.params["user_id"] == f"eq.{USER}"
    assert seen[0].url.params["order"] == "created_at.desc,id.asc"


def test_empty_write_response_is_a_store_error_not_index_error():
    def handler(request):
        return httpx.Response(201, json=[])

    with pytest.raises(MoneyStoreError):
        _run(handler, lambda repo: repo.put_nudges(
            USER, NudgesPut(pre_spend=True, patterns=True, weekly=True)
        ))


def test_list_methods_page_until_partial_page():
    seen: list[httpx.Request] = []
    pages = [[KHATA_ROW] * 1000, [KHATA_ROW]]

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=pages.pop(0))

    entries = _run(handler, lambda repo: repo.list_open_khata(USER))
    assert len(entries) == 1001
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
        _run(handler, lambda repo: repo.delete_khata(USER, "1;drop"))
    with pytest.raises(ValueError):
        _run(handler, lambda repo: repo.delete_subscription("bad", ROW_ID))


def test_http_failure_becomes_store_error():
    def handler(request):
        return httpx.Response(500, json={"message": "secret database detail"})

    with pytest.raises(MoneyStoreError) as exc_info:
        _run(handler, lambda repo: repo.list_subscriptions(USER))

    assert "secret" not in str(exc_info.value)


def test_list_templates_filters_active_archetypes_ordered_by_id():
    row = {"archetype": "default", "kind": "weekly", "title": "t", "body": "b"}
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=[row])

    got = _run(handler, lambda repo: repo.list_templates(["optimizer", "default"]))
    params = seen[0].url.params
    assert params["archetype"] == "in.(optimizer,default)"
    assert params["active"] == "eq.true"
    assert params["order"] == "id.asc"
    assert got[0].kind == "weekly"
    with pytest.raises(ValueError):
        _run(handler, lambda repo: repo.list_templates(["x,y"]))


def test_add_subscription_409_is_a_conflict_and_logs_no_body(caplog):
    def handler(request):
        return httpx.Response(409, json={"message": "duplicate SECRET-NAME"})

    data = SubscriptionCreate(
        name="Netflix", amount_paise=100, billing_day=5, starts_on=date(2026, 10, 24)
    )
    with caplog.at_level("DEBUG"), pytest.raises(MoneyConflictError):
        _run(handler, lambda repo: repo.add_subscription(USER, data))
    assert "SECRET-NAME" not in caplog.text
    assert issubclass(MoneyConflictError, MoneyStoreError)
