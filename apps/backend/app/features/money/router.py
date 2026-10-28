"""Money and profile endpoints.

The user is always the verified token subject. Rate limits share the auth
router's limiter. Request bodies are never logged.
"""

import uuid
from datetime import date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from app.features.assessment.repository import AssessmentRepository
from app.features.assessment.router import UserId, get_assessment_repo
from app.features.auth.router import limiter
from app.features.money.repository import MoneyRepository
from app.features.money.schemas import (
    Asset,
    AssetCreate,
    KhataCreate,
    KhataEntry,
    MoneySummary,
    Nudges,
    NudgesPut,
    PlannedNudge,
    Spend,
    SpendCreate,
    StartingMoney,
    StartingMoneyPut,
    Subscription,
    SubscriptionCreate,
)
from app.features.money.schemas import MAX_DATE, MIN_DATE
from app.features.money.nudges import HISTORY_DAYS, IST, build_plan
from app.features.money.service import net_worth, roll_forward

router = APIRouter(prefix="/money", tags=["money"])
profile_router = APIRouter(prefix="/profile", tags=["profile"])

MAX_RANGE_DAYS = 62  # inclusive days
Today = Annotated[date, Query(ge=MIN_DATE, le=MAX_DATE)]


def get_money_repo(request: Request) -> MoneyRepository:
    return request.app.state.money_repo


Repo = Annotated[MoneyRepository, Depends(get_money_repo)]
EntityId = uuid.UUID


def _removed(found: bool) -> Response:
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
    return await repo.add_spend(user_id, payload)


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
    worth = None
    if starting is not None:
        assets = sum(a.value_paise for a in await repo.list_assets(user_id))
        spent = await repo.sum_spends_since(user_id, starting.set_at)
        worth = net_worth(starting, assets, lent, borrowed, spent)
    return MoneySummary(
        net_worth_paise=worth,
        starting_money=starting,
        owed_to_you_paise=lent,
        you_owe_paise=borrowed,
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
    rolled = [
        sub.model_copy(update={"next_due_on": roll_forward(sub.next_due_on, sub.cadence, today)})
        for sub in await repo.list_subscriptions(user_id)
    ]
    return sorted(rolled, key=lambda sub: sub.next_due_on)


@router.post("/subscriptions", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def add_subscription(
    request: Request, payload: SubscriptionCreate, user_id: UserId, repo: Repo
) -> Subscription:
    return await repo.add_subscription(user_id, payload)


@router.delete("/subscriptions/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def delete_subscription(
    request: Request, sub_id: EntityId, user_id: UserId, repo: Repo
) -> Response:
    return _removed(await repo.delete_subscription(user_id, str(sub_id)))


# Assets ------------------------------------------------------------------------


@router.get("/assets")
@limiter.limit("120/minute")
async def list_assets(request: Request, user_id: UserId, repo: Repo) -> list[Asset]:
    return await repo.list_assets(user_id)


@router.post("/assets", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def add_asset(
    request: Request, payload: AssetCreate, user_id: UserId, repo: Repo
) -> Asset:
    return await repo.add_asset(user_id, payload)


@router.delete("/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def delete_asset(
    request: Request, asset_id: EntityId, user_id: UserId, repo: Repo
) -> Response:
    return _removed(await repo.delete_asset(user_id, str(asset_id)))


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
) -> list[PlannedNudge]:
    now = datetime.now(IST)
    start = now.date() - timedelta(days=HISTORY_DAYS - 1)
    spends = await repo.list_spends(user_id, start, now.date())
    prefs = await repo.get_nudges(user_id)
    result = await assessment_repo.get_latest_result(user_id)
    return build_plan(spends, result.primary if result else None, prefs, now)
