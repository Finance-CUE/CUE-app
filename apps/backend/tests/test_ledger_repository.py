"""Ledger repository checks against a mocked PostgREST. No network.

Run: cd apps/backend && python -m pytest tests/test_ledger_repository.py -v
"""

import asyncio
import json
import uuid
from datetime import date

import httpx
import pytest

from app.core.config import get_settings
from app.features.money.ledger_repository import LedgerRepository, to_ledger_txn
from app.features.money.ledger_schemas import AccountCreate
from app.features.money.repository import MoneyConflictError
from app.features.money.schemas import KhataCreate, SpendCreate

USER = "11111111-1111-4111-8111-111111111111"
ROW = "22222222-2222-4222-8222-222222222222"
KEY = "33333333-3333-4333-8333-333333333333"
TXN = {
    "id": ROW, "client_key": KEY, "type": "expense", "amount_paise": 50000,
    "account_id": ROW, "to_account_id": None, "khata_entry_id": None, "category": "groceries",
    "occurred_on": "2026-11-16", "created_at": "2026-11-16T08:00:00+00:00",
}  # fmt: skip


def _run(handler, action):
    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await action(LedgerRepository(get_settings(), client))

    return asyncio.run(go())


def test_list_transactions_is_scoped_to_the_user_and_skips_deleted():
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=[TXN])

    rows = _run(handler, lambda r: r.list_transactions(USER, date(2026, 11, 1), date(2026, 11, 16)))
    params = seen[0].url.params
    assert params["user_id"] == f"eq.{USER}"
    assert params["deleted_at"] == "is.null"
    assert params["and"] == "(occurred_on.gte.2026-11-01,occurred_on.lte.2026-11-16)"
    assert params["order"].endswith("id.asc")
    assert rows == [TXN]


def test_add_transaction_retry_returns_the_existing_row():
    calls: list[str] = []

    def handler(request):
        calls.append(request.method)
        if request.method == "POST":
            return httpx.Response(409, json={"code": "23505"})
        assert request.url.params["client_key"] == f"eq.{KEY}"
        assert request.url.params["user_id"] == f"eq.{USER}"
        return httpx.Response(200, json=[TXN])

    row, created = _run(handler, lambda r: r.add_transaction(USER, {"client_key": KEY, "type": "expense"}))
    assert calls == ["POST", "GET"] and row == TXN and created is False


def test_add_transaction_conflict_without_a_match_is_raised():
    def handler(request):
        if request.method == "POST":
            return httpx.Response(409)
        return httpx.Response(200, json=[])

    with pytest.raises(MoneyConflictError):
        _run(handler, lambda r: r.add_transaction(USER, {"client_key": KEY}))


def test_create_account_calls_the_atomic_function_with_the_user_from_the_token():
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json={"id": ROW, "kind": "credit_card"})

    data = AccountCreate(
        client_key=uuid.UUID(KEY), name=" Card ", kind="credit_card", opening_paise=100000,
        balance_on=date(2026, 11, 10),
    )  # fmt: skip
    _run(handler, lambda r: r.create_account(USER, data, -100000))
    assert seen[0].url.path == "/rest/v1/rpc/create_account"
    body = json.loads(seen[0].content)
    assert body["p_user"] == USER and body["p_client_key"] == KEY
    assert body["p_name"] == "Card" and body["p_opening"] == -100000
    assert body["p_balance_on"] == "2026-11-10"


def test_soft_delete_and_undo_target_the_right_rows():
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=[TXN])

    _run(handler, lambda r: r.set_deleted(USER, ROW, True))
    _run(handler, lambda r: r.set_deleted(USER, ROW, False))
    delete, undo = seen
    assert delete.method == undo.method == "PATCH"
    assert delete.url.params["deleted_at"] == "is.null"
    assert json.loads(delete.content)["deleted_at"] is not None
    assert undo.url.params["deleted_at"] == "not.is.null"
    assert json.loads(undo.content) == {"deleted_at": None}
    assert all(r.url.params["user_id"] == f"eq.{USER}" for r in seen)


def test_non_uuid_ids_raise_before_any_request():
    def handler(request):
        raise AssertionError("no request expected")

    with pytest.raises(ValueError):
        _run(handler, lambda r: r.get_transaction(USER, "1 or 1=1"))


ENTRY = {
    "id": ROW, "user_id": USER, "direction": "lent", "person": "Asha", "amount_paise": 300,
    "note": None, "settled_at": None, "created_at": "2026-11-16T08:00:00+00:00",
}  # fmt: skip


def test_add_khata_entry_calls_the_atomic_function():
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=ENTRY)

    data = KhataCreate(direction="lent", person="Asha", amount_paise=300)
    entry = _run(handler, lambda r: r.add_khata_entry(USER, data, KEY, ROW, date(2026, 11, 16)))
    assert seen[0].url.path == "/rest/v1/rpc/add_khata_entry"
    assert json.loads(seen[0].content) == {
        "p_user": USER, "p_client_key": KEY, "p_direction": "lent", "p_person": "Asha",
        "p_amount": 300, "p_note": None, "p_account": ROW, "p_on": "2026-11-16",
    }  # fmt: skip
    assert entry.id == ROW


def test_add_khata_entry_without_an_account_sends_null():
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=ENTRY)

    data = KhataCreate(direction="lent", person="Asha", amount_paise=300)
    _run(handler, lambda r: r.add_khata_entry(USER, data, KEY, None, date(2026, 11, 16)))
    assert json.loads(seen[0].content)["p_account"] is None


def test_settle_returns_none_for_the_functions_empty_row():
    """A function returning a row type sends all-null fields when nothing matched."""
    empty = {k: None for k in ENTRY}
    got = _run(
        lambda request: httpx.Response(200, json=empty),
        lambda r: r.settle_khata_entry(USER, ROW, None, date(2026, 11, 16)),
    )
    assert got is None
    got = _run(
        lambda request: httpx.Response(200, json=ENTRY),
        lambda r: r.settle_khata_entry(USER, ROW, ROW, date(2026, 11, 16)),
    )
    assert got is not None and got.person == "Asha"


def test_subscription_payment_and_answers_use_the_ledger_functions():
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        if request.url.path.endswith("answer_cycle_ledger"):
            return httpx.Response(200, json=True)
        if request.url.path.endswith("answered_cycles"):
            return httpx.Response(200, json=[
                {"subscription_id": ROW, "month": "2026-09-01"},
                {"subscription_id": ROW, "month": "2026-10-01"},
            ])  # fmt: skip
        return httpx.Response(200, json=TXN)

    spend = SpendCreate(
        description="Netflix", amount_paise=19900, category="subscription",
        spent_on=date(2026, 10, 24), billing_day=31,
    )  # fmt: skip
    _run(handler, lambda r: r.log_subscription_txn(USER, ROW, spend))
    ok = _run(handler, lambda r: r.answer_cycle(USER, ROW, date(2026, 10, 1), True, ROW))
    months = _run(handler, lambda r: r.list_cycle_months(USER))
    log, answer, answered = seen
    assert log.url.path == "/rest/v1/rpc/log_subscription_txn"
    assert json.loads(log.content) == {
        "p_user": USER, "p_account": ROW, "p_description": "Netflix", "p_amount": 19900,
        "p_on": "2026-10-24", "p_billing_day": 31,
    }  # fmt: skip
    assert ok is True and json.loads(answer.content)["p_account"] == ROW
    assert json.loads(answered.content) == {"p_user": USER}
    assert months == {ROW: {date(2026, 9, 1), date(2026, 10, 1)}}


def test_rows_convert_to_ledger_transactions():
    t = to_ledger_txn(TXN)
    assert t.amount_paise == 50000 and t.occurred_on == date(2026, 11, 16)
    assert t.created_at.tzinfo is not None
