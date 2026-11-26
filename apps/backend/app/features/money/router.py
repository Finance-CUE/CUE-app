"""Money and profile endpoints.

These are the routes the current app (1.1.x) uses. Since the ledger release
they read and write the account ledger (sql/010, sql/011) with the same
request and response shapes; legacy.py does the translation.

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
from app.features.money import ledger, legacy, schedule
from app.features.money.archetype_booklet import load_archetype_context
from app.features.money.ledger_repository import LedgerRepository, to_ledger_txn, to_schedule_item
from app.features.money.ledger_schemas import AccountCreate
from app.features.money.nudges import HISTORY_DAYS, build_plan
from app.features.money.repository import MoneyConflictError, MoneyStoreError
from app.features.money.schemas import (
    MAX_DATE,
    MIN_DATE,
    CycleAnswer,
    SettleRequest,
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
from app.features.money.service import billing_date, due_months, next_billing_on

router = APIRouter(prefix="/money", tags=["money"])
profile_router = APIRouter(prefix="/profile", tags=["profile"])

MAX_RANGE_DAYS = 62  # inclusive days
TREND_DAYS = 30
Today = Annotated[date, Query(ge=MIN_DATE, le=MAX_DATE)]


def get_money_repo(request: Request) -> LedgerRepository:
    return request.app.state.money_repo


def get_tz(tz: Annotated[str, Query(max_length=64)] = "Asia/Kolkata") -> ZoneInfo:
    try:
        return ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError, OSError):  # OSError: "Asia" is a directory
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Unknown time zone."
        ) from None


Tz = Annotated[ZoneInfo, Depends(get_tz)]
Repo = Annotated[LedgerRepository, Depends(get_money_repo)]
EntityId = uuid.UUID


def _removed(found: bool) -> Response:
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This entry no longer exists. Pull down to refresh.",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _ledger(repo: LedgerRepository, user_id: str):
    return await repo.list_accounts(user_id), [
        to_ledger_txn(r) for r in await repo.list_transactions(user_id)
    ]


async def _spends(repo: LedgerRepository, user_id: str, start: date, end: date) -> list[Spend]:
    return legacy.spends_of(await repo.list_transactions(user_id, start, end))


async def _chosen_account(repo: LedgerRepository, user_id: str, account_id: uuid.UUID) -> str:
    """The account chip's account, if it is the user's and open."""
    rows = await repo.list_accounts(user_id)
    if not any(r["id"] == str(account_id) and r.get("archived_at") is None for r in rows):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="That account isn't available. Pull down to refresh.",
        )
    return str(account_id)


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
    return await _spends(repo, user_id, start, end)


@router.post("/spends", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def add_spend(request: Request, payload: SpendCreate, user_id: UserId, repo: Repo) -> Spend:
    """An expense on the user's bank account (the old app has no account picker)."""
    account = legacy.pick_account(await repo.list_accounts(user_id), "bank")
    if payload.category == "subscription":
        return legacy.to_spend(await repo.log_subscription_txn(user_id, account, payload))
    row, _ = await repo.add_transaction(
        user_id,
        {
            "client_key": str(uuid.uuid4()),
            "type": "expense",
            "amount_paise": payload.amount_paise,
            "account_id": account,
            "category": legacy.OLD_TO_NEW[payload.category],
            "description": payload.description,
            "occurred_on": payload.spent_on.isoformat(),
            "source": "app" if account else "legacy",
        },
    )
    return legacy.to_spend(row)


@router.patch("/spends/{spend_id}")
@limiter.limit("60/minute")
async def edit_spend(
    request: Request, spend_id: EntityId, payload: SpendUpdate, user_id: UserId, repo: Repo
) -> Spend:
    current = await repo.get_transaction(user_id, str(spend_id))
    updated = None
    # Subscription payments are edited through their subscription.
    if (
        current is not None
        and current["type"] == "expense"
        and not current.get("deleted_at")
        and current.get("category") != "subscriptions"
    ):
        updated = await repo.update_transaction(
            user_id,
            str(spend_id),
            {
                "description": payload.description,
                "amount_paise": payload.amount_paise,
                "category": legacy.OLD_TO_NEW[payload.category],
                "occurred_on": payload.spent_on.isoformat(),
            },
        )
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This entry can't be edited. Pull down to refresh, or delete it and log it again.",
        )
    return legacy.to_spend(updated)


@router.delete("/spends/{spend_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def delete_spend(
    request: Request, spend_id: EntityId, user_id: UserId, repo: Repo
) -> Response:
    current = await repo.get_transaction(user_id, str(spend_id))
    if current is None or current["type"] != "expense" or current.get("deleted_at"):
        return _removed(False)
    # Soft delete: the new app's Undo can restore it.
    return _removed(await repo.set_deleted(user_id, str(spend_id), True) is not None)


# Starting money and summary ----------------------------------------------------


@router.put("/starting-money")
@limiter.limit("60/minute")
async def put_starting_money(
    request: Request, payload: StartingMoneyPut, user_id: UserId, repo: Repo, tz: Tz
) -> StartingMoney:
    """The old "set your balance" sheet.

    First time: a Bank and a Cash account, opened today. After that, each one
    that differs from today's balance gets a dated adjustment, so history is
    never rewritten (spec 4.5, Reconcile).
    """
    today = datetime.now(tz).date()
    rows, txns = await _ledger(repo, user_id)
    balances = ledger.account_balances_on(
        [ledger.Account(id=r["id"], kind=r["kind"]) for r in rows], txns, today
    )
    bank_now, cash_now = legacy.split_balances(rows, balances)
    for prefer, kind, name, target, now in (
        ("bank", "savings", "Bank", payload.bank_paise, bank_now),
        ("cash", "cash", "Cash", payload.cash_paise, cash_now),
    ):
        same = [r for r in rows if (r["kind"] == "cash") == (prefer == "cash")]
        account = legacy.pick_account(same, prefer)
        if account is None:
            await repo.create_account(
                user_id,
                AccountCreate(
                    client_key=uuid.uuid4(), name=name, kind=kind,
                    opening_paise=target, balance_on=today,
                ),  # fmt: skip
                target,
            )
        elif target != now:
            await repo.add_transaction(
                user_id,
                {
                    "client_key": str(uuid.uuid4()),
                    "type": "adjustment",
                    "amount_paise": target - now,
                    "account_id": account,
                    "description": "Balance adjustment",
                    "reason": "Balance updated",
                    "occurred_on": today.isoformat(),
                },
            )
    return StartingMoney(
        bank_paise=payload.bank_paise, cash_paise=payload.cash_paise, set_at=datetime.now(tz)
    )


@router.get("/summary")
@limiter.limit("120/minute")
async def summary(request: Request, user_id: UserId, repo: Repo, tz: Tz) -> MoneySummary:
    rows, txns = await _ledger(repo, user_id)
    return legacy.build_summary(rows, txns, datetime.now(tz).date())


# Khata -------------------------------------------------------------------------


@router.get("/khata")
@limiter.limit("120/minute")
async def list_khata(request: Request, user_id: UserId, repo: Repo) -> list[KhataEntry]:
    return await repo.list_open_khata(user_id)


@router.post("/khata", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def add_khata(
    request: Request, payload: KhataCreate, user_id: UserId, repo: Repo, tz: Tz
) -> KhataEntry:
    """Lend or borrow: money leaves or arrives in the chosen account (default
    Cash), and the receivable or liability counts in net worth."""
    if payload.account_id is not None:
        account = await _chosen_account(repo, user_id, payload.account_id)
    else:
        account = legacy.pick_account(await repo.list_accounts(user_id), "cash")
    return await repo.add_khata_entry(
        user_id,
        payload,
        str(payload.client_key or uuid.uuid4()),
        account,
        datetime.now(tz).date(),
    )


@router.post("/khata/{entry_id}/settle", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def settle_khata(
    request: Request,
    entry_id: EntityId,
    user_id: UserId,
    repo: Repo,
    tz: Tz,
    payload: SettleRequest | None = None,
) -> Response:
    """Settling moves real money: money lent comes back into the account, money
    borrowed is paid from it. Repayments are not income or spending."""
    if payload is not None and payload.account_id is not None:
        account = await _chosen_account(repo, user_id, payload.account_id)
    else:
        method = payload.method if payload else None
        account = legacy.pick_account(
            await repo.list_accounts(user_id), "cash" if method == "cash" else "bank"
        )
    entry = await repo.settle_khata_entry(user_id, str(entry_id), account, datetime.now(tz).date())
    return _removed(entry is not None)


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
    account = legacy.pick_account(await repo.list_accounts(user_id), "bank")
    return _removed(
        await repo.answer_cycle(user_id, str(sub_id), payload.month, payload.active, account)
    )


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
    spends = await _spends(repo, user_id, start, now.date())
    prefs = await repo.get_nudges(user_id)
    result = await assessment_repo.get_latest_result(user_id)
    slug = result.primary if result else None
    try:
        templates = await repo.list_templates([slug, "default"] if slug else ["default"])
    except MoneyStoreError:  # subscription nudges need no templates
        templates = []
    # Every scheduled payment with its reminder on (sql/012): subscriptions, bills,
    # rent, EMIs. Expected income is never a reminder.
    answers = await repo.schedule_answers(user_id)
    subs = [
        Subscription(
            id=item.id,
            name=item.name,
            amount_paise=item.amount_paise,
            billing_day=item.billing_day,
            starts_on=item.starts_on,
            active=True,
            created_at=row["created_at"],
            next_billing_on=schedule.next_due(item, answers, now.date()),
        )
        for row in await repo.list_schedule(user_id)
        if (item := to_schedule_item(row)).active and item.reminder and schedule.is_payment(item)
    ]
    return build_plan(
        spends, slug, prefs, now, templates, subs, load_archetype_context(slug)
    )


@profile_router.get("/trend")
@limiter.limit("120/minute")
async def trend(
    request: Request, today: Today, tz: Tz, user_id: UserId, repo: Repo
) -> list[TrendPoint]:
    """30 days of bank + cash and daily spending, from the ledger."""
    start = today - timedelta(days=TREND_DAYS - 1)
    rows, txns = await _ledger(repo, user_id)
    return legacy.build_trend(rows, txns, start, today)
