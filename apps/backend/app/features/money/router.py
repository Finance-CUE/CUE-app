"""Money and profile endpoints.

The user is always the verified token subject. Rate limits share the auth
router's limiter. Request bodies are never logged.
"""

import uuid
from datetime import date, datetime, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from app.features.assessment.repository import AssessmentRepository
from app.features.assessment.router import UserId, get_assessment_repo
from app.features.auth.router import limiter
from app.features.money.archetype_booklet import load_archetype_context
from app.features.money.nudges import HISTORY_DAYS, build_plan
from app.features.money.repository import MoneyConflictError, MoneyRepository, MoneyStoreError
from app.features.money.schemas import (
    MAX_DATE,
    MIN_DATE,
    CycleAnswer,
    DueCycle,
    KhataCreate,
    KhataEntry,
    MoneySummary,
    Nudges,
    NudgesPut,
    PlannedNudge,
    Spend,
    SpendCreate,
    SpendUpdate,
    StartingMoney,
    StartingMoneyPut,
    Subscription,
    SubscriptionCreate,
    TrendPoint,
)
from app.features.money.service import billing_date, build_trend, due_months, net_worth, next_billing_on

router = APIRouter(prefix="/money", tags=["money"])
profile_router = APIRouter(prefix="/profile", tags=["profile"])

MAX_RANGE_DAYS = 62  # inclusive days
TREND_DAYS = 30
Today = Annotated[date, Query(ge=MIN_DATE, le=MAX_DATE)]


def get_money_repo(request: Request) -> MoneyRepository:
    return request.app.state.money_repo


def get_tz(tz: Annotated[str, Query(max_length=64)] = "Asia/Kolkata") -> ZoneInfo:
    try:
        return ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError, OSError):  # OSError: "Asia" is a directory
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Unknown time zone."
        ) from None


Tz = Annotated[ZoneInfo, Depends(get_tz)]
Repo = Annotated[MoneyRepository, Depends(get_money_repo)]
EntityId = uuid.UUID


def _removed(found: bool) -> Response:
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This entry no longer exists. Pull down to refresh.",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _next_billing(sub: Subscription, answered: dict[str, set[date]], today: date) -> date | None:
    if not sub.active:
        return None
    return next_billing_on(sub.billing_day, sub.starts_on, answered.get(sub.id, set()), today)


# Spends ----------------------------------------------------------------------


@router.get("/spends")
@limiter.limit("120/minute")
async def list_spends(
    request: Request, start: date, end: date, user_id: UserId, repo: Repo
) -> list[Spend]:
    if end < start or (end - start).days >= MAX_RANGE_DAYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Choose a date range of at most {MAX_RANGE_DAYS} days.",
        )
    return await repo.list_spends(user_id, start, end)


@router.post("/spends", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def add_spend(request: Request, payload: SpendCreate, user_id: UserId, repo: Repo) -> Spend:
    if payload.category == "subscription":
        return await repo.add_subscription_spend(user_id, payload)
    return await repo.add_spend(user_id, payload)


@router.patch("/spends/{spend_id}")
@limiter.limit("60/minute")
async def edit_spend(
    request: Request, spend_id: EntityId, payload: SpendUpdate, user_id: UserId, repo: Repo
) -> Spend:
    updated = await repo.update_spend(user_id, str(spend_id), payload)
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This entry can't be edited. Pull down to refresh, or delete it and log it again.",
        )
    return updated


@router.delete("/spends/{spend_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def delete_spend(
    request: Request, spend_id: EntityId, user_id: UserId, repo: Repo
) -> Response:
    return _removed(await repo.delete_spend(user_id, str(spend_id)))


# Starting money and summary ----------------------------------------------------


@router.put("/starting-money")
@limiter.limit("60/minute")
async def put_starting_money(
    request: Request, payload: StartingMoneyPut, user_id: UserId, repo: Repo
) -> StartingMoney:
    return await repo.put_starting_money(user_id, payload)


@router.get("/summary")
@limiter.limit("120/minute")
async def summary(request: Request, user_id: UserId, repo: Repo) -> MoneySummary:
    starting = await repo.get_starting_money(user_id)
    open_khata = await repo.list_open_khata(user_id)
    lent = sum(k.amount_paise for k in open_khata if k.direction == "lent")
    borrowed = sum(k.amount_paise for k in open_khata if k.direction == "borrowed")
    since = 0
    if starting:
        # Balances saved before set_at was restamped on update still left a history
        # row; the newest of the two is when the typed balance was last true.
        history = await repo.list_balance_history(user_id)
        anchor = max([starting.set_at, *(h.recorded_at for h in history)])
        since = await repo.sum_spends_logged_after(user_id, anchor)
    return MoneySummary(
        net_worth_paise=net_worth(starting, lent, borrowed, since),
        starting_money=starting,
        owed_to_you_paise=lent,
        you_owe_paise=borrowed,
        spent_since_update_paise=since,
    )


# Khata -------------------------------------------------------------------------


@router.get("/khata")
@limiter.limit("120/minute")
async def list_khata(request: Request, user_id: UserId, repo: Repo) -> list[KhataEntry]:
    return await repo.list_open_khata(user_id)


@router.post("/khata", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def add_khata(
    request: Request, payload: KhataCreate, user_id: UserId, repo: Repo
) -> KhataEntry:
    return await repo.add_khata(user_id, payload)


@router.post("/khata/{entry_id}/settle", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def settle_khata(
    request: Request, entry_id: EntityId, user_id: UserId, repo: Repo
) -> Response:
    return _removed(await repo.settle_khata(user_id, str(entry_id)))


@router.delete("/khata/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def delete_khata(
    request: Request, entry_id: EntityId, user_id: UserId, repo: Repo
) -> Response:
    return _removed(await repo.delete_khata(user_id, str(entry_id)))


# Subscriptions -----------------------------------------------------------------


@router.get("/subscriptions")
@limiter.limit("120/minute")
async def list_subscriptions(
    request: Request, today: Today, user_id: UserId, repo: Repo
) -> list[Subscription]:
    answered = await repo.list_cycle_months(user_id)
    subs = [
        sub.model_copy(update={"next_billing_on": _next_billing(sub, answered, today)})
        for sub in await repo.list_subscriptions(user_id)
    ]
    return sorted(subs, key=lambda sub: (not sub.active, sub.next_billing_on or date.max))


@router.get("/subscriptions/due")
@limiter.limit("120/minute")
async def due_subscriptions(
    request: Request, today: Today, user_id: UserId, repo: Repo
) -> list[DueCycle]:
    answered = await repo.list_cycle_months(user_id)
    due = [
        DueCycle(
            subscription_id=sub.id,
            name=sub.name,
            amount_paise=sub.amount_paise,
            month=month,
            billing_on=billing_date(month, sub.billing_day),
        )
        for sub in await repo.list_subscriptions(user_id)
        if sub.active
        for month in due_months(sub.billing_day, sub.starts_on, answered.get(sub.id, set()), today)
    ]
    return sorted(due, key=lambda d: d.billing_on)


@router.post("/subscriptions/{sub_id}/cycles", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def answer_cycle(
    request: Request, sub_id: EntityId, payload: CycleAnswer, user_id: UserId, repo: Repo
) -> Response:
    return _removed(await repo.answer_cycle(user_id, str(sub_id), payload.month, payload.active))


@router.post("/subscriptions", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def add_subscription(
    request: Request, payload: SubscriptionCreate, user_id: UserId, repo: Repo
) -> Subscription:
    try:
        return await repo.add_subscription(user_id, payload)
    except MoneyConflictError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have an active subscription with that name.",
        ) from None


@router.delete("/subscriptions/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def delete_subscription(
    request: Request, sub_id: EntityId, user_id: UserId, repo: Repo
) -> Response:
    return _removed(await repo.delete_subscription(user_id, str(sub_id)))


# Nudge preferences -------------------------------------------------------------


@profile_router.get("/nudges")
@limiter.limit("120/minute")
async def get_nudges(request: Request, user_id: UserId, repo: Repo) -> Nudges:
    return await repo.get_nudges(user_id)


@profile_router.put("/nudges")
@limiter.limit("60/minute")
async def put_nudges(
    request: Request, payload: NudgesPut, user_id: UserId, repo: Repo
) -> Nudges:
    return await repo.put_nudges(user_id, payload)


@profile_router.get("/nudges/plan")
@limiter.limit("120/minute")
async def nudge_plan(
    request: Request,
    user_id: UserId,
    repo: Repo,
    assessment_repo: Annotated[AssessmentRepository, Depends(get_assessment_repo)],
    tz: Tz,
) -> list[PlannedNudge]:
    now = datetime.now(tz)
    start = now.date() - timedelta(days=HISTORY_DAYS - 1)
    spends = await repo.list_spends(user_id, start, now.date())
    prefs = await repo.get_nudges(user_id)
    result = await assessment_repo.get_latest_result(user_id)
    slug = result.primary if result else None
    try:
        templates = await repo.list_templates([slug, "default"] if slug else ["default"])
    except MoneyStoreError:  # subscription nudges need no templates
        templates = []
    answered = await repo.list_cycle_months(user_id)
    subs = [
        sub.model_copy(update={"next_billing_on": _next_billing(sub, answered, now.date())})
        for sub in await repo.list_subscriptions(user_id)
        if sub.active
    ]
    return build_plan(
        spends, slug, prefs, now, templates, subs, load_archetype_context(slug)
    )


@profile_router.get("/trend")
@limiter.limit("120/minute")
async def trend(
    request: Request, today: Today, tz: Tz, user_id: UserId, repo: Repo
) -> list[TrendPoint]:
    start = today - timedelta(days=TREND_DAYS - 1)
    return build_trend(
        await repo.list_balance_history(user_id),
        await repo.list_spends(user_id, start, today),
        start,
        today,
        tz,
    )
