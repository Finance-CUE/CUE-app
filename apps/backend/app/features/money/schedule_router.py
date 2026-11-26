"""Scheduled payments and recurring income (dashboard spec P1, section 4.8).

Subscriptions, bills, rent, EMIs, other payments and salary. A due is not an
expense: an entry is recorded only when the user marks it paid, and a passed
due date stays open until they answer it.
"""

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Query, Request, Response, status

from app.features.assessment.router import UserId
from app.features.auth.router import limiter
from app.features.money import schedule
from app.features.money.ledger_repository import LedgerRepository, to_schedule_item
from app.features.money.ledger_router import (
    EntityId,
    Repo,
    Today,
    _active_account_ids,
    _fail,
    _txn_out,
)
from app.features.money.ledger_schemas import (
    OccurrenceOut,
    PayRequest,
    ScheduleCreate,
    ScheduleFields,
    ScheduleOut,
    ScheduleUpdate,
    SkipRequest,
    TransactionOut,
)
from app.features.money.repository import MoneyConflictError
from app.features.money.schemas import MAX_DATE, MIN_DATE

router = APIRouter(prefix="/money", tags=["scheduled"])

MAX_DUE_RANGE_DAYS = 400
NAME_TAKEN = "You already have an active item with that name."


def _gone_item():
    return _fail(status.HTTP_404_NOT_FOUND, "This item no longer exists. Pull down to refresh.")


def item_body(data: ScheduleFields) -> dict:
    """The stored row. The billing day is the next date's day; starts_on is the day
    before it, so the old routes (which count dues after starts_on) agree."""
    return {
        "kind": data.kind,
        "name": data.name,
        "amount_paise": data.amount_paise,
        "frequency": data.frequency,
        "first_due_on": data.next_on.isoformat(),
        "billing_day": data.next_on.day,
        "starts_on": (data.next_on - timedelta(days=1)).isoformat(),
        "account_id": str(data.account_id),
        "category": data.category,
        "variable": data.variable,
        "reminder": data.reminder,
    }


async def _check_account(repo: LedgerRepository, user_id: str, account_id) -> None:
    if str(account_id) not in await _active_account_ids(repo, user_id):
        raise _fail(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "That account isn't available. Pull down to refresh."
        )


def schedule_out(row: dict, answers: dict, today: date) -> ScheduleOut:
    item = to_schedule_item(row)
    return ScheduleOut(
        id=item.id,
        kind=item.kind,
        name=item.name,
        amount_paise=item.amount_paise,
        frequency=item.frequency,
        billing_day=item.billing_day,
        account_id=item.account_id,
        category=item.category,
        variable=item.variable,
        reminder=item.reminder,
        active=item.active,
        next_due_on=schedule.next_due(item, answers, today),
        created_at=row["created_at"],
    )


def occurrence_out(o: schedule.Occurrence) -> OccurrenceOut:
    i = o.item
    return OccurrenceOut(
        schedule_id=i.id,
        kind=i.kind,
        name=i.name,
        amount_paise=i.amount_paise,
        frequency=i.frequency,
        account_id=i.account_id,
        category=i.category,
        variable=i.variable,
        reminder=i.reminder,
        due_on=o.due_on,
        status=o.status,
        transaction_id=o.transaction_id,
    )


async def load_schedule(
    repo: LedgerRepository, user_id: str
) -> tuple[list[dict], dict[tuple[str, date], schedule.Answer]]:
    return await repo.list_schedule(user_id), await repo.schedule_answers(user_id)


# Items ------------------------------------------------------------------------------


@router.get("/scheduled")
@limiter.limit("120/minute")
async def list_scheduled(request: Request, today: Today, user_id: UserId, repo: Repo) -> list[ScheduleOut]:
    """Active items, soonest next due first."""
    rows, answers = await load_schedule(repo, user_id)
    items = [schedule_out(r, answers, today) for r in rows if r["active"]]
    return sorted(items, key=lambda s: (s.next_due_on or date.max, s.name.casefold()))


@router.post("/scheduled", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def add_scheduled(
    request: Request, payload: ScheduleCreate, today: Today, user_id: UserId, repo: Repo, response: Response
) -> ScheduleOut:
    """Quick Add's Subscription tile, and a spend added for a future date ('once')."""
    await _check_account(repo, user_id, payload.account_id)
    try:
        row, created = await repo.create_schedule(
            user_id, {**item_body(payload), "client_key": str(payload.client_key)}
        )
    except MoneyConflictError:
        raise _fail(status.HTTP_409_CONFLICT, NAME_TAKEN) from None
    if not created:
        response.status_code = status.HTTP_200_OK
    return schedule_out(row, await repo.schedule_answers(user_id), today)


@router.patch("/scheduled/{item_id}")
@limiter.limit("60/minute")
async def edit_scheduled(
    request: Request, item_id: EntityId, payload: ScheduleUpdate, today: Today, user_id: UserId, repo: Repo
) -> ScheduleOut:
    await _check_account(repo, user_id, payload.account_id)
    try:
        row = await repo.update_schedule(user_id, str(item_id), item_body(payload))
    except MoneyConflictError:
        raise _fail(status.HTTP_409_CONFLICT, NAME_TAKEN) from None
    if row is None:
        raise _gone_item()
    return schedule_out(row, await repo.schedule_answers(user_id), today)


@router.post("/scheduled/{item_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def cancel_scheduled(request: Request, item_id: EntityId, user_id: UserId, repo: Repo) -> Response:
    """Stops future dues. Payments already recorded stay."""
    if not await repo.cancel_schedule(user_id, str(item_id)):
        raise _gone_item()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Due dates --------------------------------------------------------------------------


@router.get("/dues")
@limiter.limit("120/minute")
async def list_dues(
    request: Request,
    start: Annotated[date, Query(ge=MIN_DATE, le=MAX_DATE)],
    end: Annotated[date, Query(ge=MIN_DATE, le=MAX_DATE)],
    user_id: UserId,
    repo: Repo,
    open_before: bool = False,
) -> list[OccurrenceOut]:
    """Due dates from start to end, soonest first, paid and skipped ones included
    (the calendar greys them). open_before adds unanswered dates before start."""
    if end < start or (end - start).days >= MAX_DUE_RANGE_DAYS:
        raise _fail(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Choose a date range of at most {MAX_DUE_RANGE_DAYS} days.",
        )
    rows, answers = await load_schedule(repo, user_id)
    found = schedule.occurrences([to_schedule_item(r) for r in rows], answers, start, end, open_before)
    return [occurrence_out(o) for o in found]


async def _due_item(repo: LedgerRepository, user_id: str, item_id: str, due_on: date) -> dict:
    """The item, checked to fall due on `due_on`."""
    row = await repo.get_schedule(user_id, item_id)
    if row is None:
        raise _gone_item()
    if due_on not in set(schedule.due_dates(to_schedule_item(row), due_on)):
        raise _fail(status.HTTP_422_UNPROCESSABLE_CONTENT, "That isn't one of this item's due dates.")
    return row


@router.post("/scheduled/{item_id}/pay", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def pay_scheduled(
    request: Request, item_id: EntityId, payload: PayRequest, today: Today, user_id: UserId, repo: Repo
) -> TransactionOut:
    """Mark paid (or received): records the expense or income. A retry with the same
    client key returns the entry already made."""
    existing = await repo.get_by_client_key(user_id, str(payload.client_key))
    if existing is not None:
        return _txn_out(existing)
    if payload.occurred_on > today:
        raise _fail(status.HTTP_422_UNPROCESSABLE_CONTENT, "The date can't be in the future.")
    await _due_item(repo, user_id, str(item_id), payload.due_on)
    await _check_account(repo, user_id, payload.account_id)
    row = await repo.pay_scheduled(
        user_id,
        str(item_id),
        payload.due_on.replace(day=1),
        str(payload.client_key),
        payload.amount_paise,
        str(payload.account_id),
        payload.occurred_on,
    )
    if row is None:
        raise _fail(status.HTTP_409_CONFLICT, "This one is already marked. Pull down to refresh.")
    return _txn_out(row)


@router.post("/scheduled/{item_id}/skip", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def skip_scheduled(
    request: Request, item_id: EntityId, payload: SkipRequest, user_id: UserId, repo: Repo
) -> Response:
    """Skip this due date only; the item carries on."""
    await _due_item(repo, user_id, str(item_id), payload.due_on)
    if not await repo.skip_scheduled(user_id, str(item_id), payload.due_on.replace(day=1)):
        raise _fail(status.HTTP_409_CONFLICT, "This one is already marked. Pull down to refresh.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/scheduled/{item_id}/unskip", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def unskip_scheduled(
    request: Request, item_id: EntityId, payload: SkipRequest, user_id: UserId, repo: Repo
) -> Response:
    """Undo a Skip."""
    if not await repo.unskip_scheduled(user_id, str(item_id), payload.due_on.replace(day=1)):
        raise _gone_item()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
