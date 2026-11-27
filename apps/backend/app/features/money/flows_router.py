"""Money in and out (dashboard spec P1): this month's tiles and their screens,
cash flow, the net worth chart and the left-to-spend line.

Worked out on the server by app.features.money.flows from the whole ledger;
the app only displays it.
"""

from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request

from app.features.assessment.router import UserId
from app.features.auth.router import limiter
from app.features.money import flows, ledger, schedule
from app.features.money import jars as jars_logic
from app.features.money.ledger_repository import to_jar_move, to_ledger_account, to_schedule_item
from app.features.money.ledger_router import Repo, Today, _load
from app.features.money.ledger_schemas import (
    BucketOut,
    CashFlowOut,
    CategoryOut,
    HistoryPointOut,
    LeftToSpendOut,
    MonthOut,
    MonthPointOut,
    NetWorthHistoryOut,
)
from app.features.money.schemas import MAX_DATE, MIN_DATE
from app.features.money.schedule_router import load_schedule

router = APIRouter(prefix="/money", tags=["flows"])


def _left_to_spend(
    items: list[schedule.Item],
    answers: dict,
    free_paise: int,
    today: date,
    has_accounts: bool,
) -> LeftToSpendOut | None:
    """Shown only once there is a salary date and an account (section 8)."""
    if not has_accounts:
        return None
    paydays = [
        d
        for i in items
        if i.kind == "income" and i.category == "salary"
        and (d := schedule.next_due(i, answers, today)) is not None
    ]  # fmt: skip
    if not paydays:
        return None
    payday = min(paydays)
    dues = sum(
        o.item.amount_paise
        for o in schedule.occurrences(items, answers, today, payday - timedelta(days=1))
        if o.status == "due" and schedule.is_payment(o.item)
    )
    return LeftToSpendOut(
        per_day_paise=flows.left_to_spend_today(free_paise, dues, today, payday),
        free_paise=free_paise,
        dues_before_paise=dues,
        next_salary_on=payday,
    )


@router.get("/month")
@limiter.limit("120/minute")
async def this_month(request: Request, today: Today, user_id: UserId, repo: Repo) -> MonthOut:
    """This month's four tiles (4.4), from the 1st to today."""
    rows, txns = await _load(repo, user_id)
    sched_rows, answers = await load_schedule(repo, user_id)
    items = [to_schedule_item(r) for r in sched_rows]
    first = today.replace(day=1)
    figures = flows.month_figures(txns, first, today)
    last_start, last_end = flows.same_days_last_month(today)
    dues = [
        o
        for o in schedule.occurrences(items, answers, today, flows.month_end(first))
        if o.status == "due" and schedule.is_payment(o.item)
    ]
    accounts = [to_ledger_account(r) for r in rows]
    # Free balance (section 8): available balance − money set aside in Goal Jars.
    jar_money = jars_logic.in_jars_by_account(to_jar_move(m) for m in await repo.list_jar_moves(user_id))
    available_ids = {a.id for a in accounts if a.kind in ledger.AVAILABLE_KINDS}
    free = ledger.position_on(accounts, txns, today).available_paise - sum(
        v for k, v in jar_money.items() if k in available_ids
    )
    return MonthOut(
        month=first,
        income_paise=figures.income,
        salary_paise=figures.salary,
        other_income_paise=figures.other_income,
        expenses_paise=figures.expenses,
        daily_average_paise=flows.daily_average(figures.expenses, today),
        expenses_same_days_last_month_paise=flows.expenses_between(txns, last_start, last_end),
        savings_paise=figures.savings,
        savings_rate=figures.rate,
        dues_paise=sum(o.item.amount_paise for o in dues),
        dues_count=len(dues),
        categories=[
            CategoryOut(category=c, paise=p) for c, p in flows.by_category(txns, first, today).items()
        ],
        left_to_spend=_left_to_spend(
            items, answers, free, today, any(r.get("archived_at") is None for r in rows)
        ),
    )


@router.get("/months")
@limiter.limit("120/minute")
async def month_by_month(
    request: Request,
    today: Today,
    user_id: UserId,
    repo: Repo,
    count: Annotated[int, Query(ge=1, le=12)] = 6,
) -> list[MonthPointOut]:
    """Income bars and the savings trend: the last `count` months, oldest first."""
    _, txns = await _load(repo, user_id)
    return [
        MonthPointOut(
            month=m.month,
            income_paise=m.income,
            salary_paise=m.salary,
            expenses_paise=m.expenses,
            savings_paise=m.savings,
            savings_rate=m.rate,
        )
        for m in flows.monthly_series(txns, today, count)
    ]


@router.get("/cash-flow")
@limiter.limit("120/minute")
async def cash_flow(
    request: Request,
    period: Literal["week", "month", "quarter"],
    on: Annotated[date, Query(ge=MIN_DATE, le=MAX_DATE)],
    today: Today,
    user_id: UserId,
    repo: Repo,
) -> CashFlowOut:
    """Where your money moves (4.6) for the week, month or three months around `on`."""
    _, txns = await _load(repo, user_id)
    buckets = flows.cash_flow_buckets(txns, period, on)
    received = sum(b.income for b in buckets)
    spent = sum(b.expenses for b in buckets)
    return CashFlowOut(
        period=period,
        buckets=[
            BucketOut(start=b.start, end=b.end, income_paise=b.income, expenses_paise=b.expenses, count=b.count)
            for b in buckets
        ],
        received_paise=received,
        spent_paise=spent,
        remaining_paise=received - spent,
        enough_data=flows.enough_for_cash_flow(txns, today),
    )


@router.get("/net-worth/history")
@limiter.limit("120/minute")
async def net_worth_history(
    request: Request,
    today: Today,
    user_id: UserId,
    repo: Repo,
    days: Annotated[int, Query(ge=2, le=366)] = 30,
) -> NetWorthHistoryOut:
    """The net worth chart (4.3): one point per day, the last `days` days to today.
    Days before the user's first data are left out ("History starts …")."""
    rows, txns = await _load(repo, user_id)
    accounts = [to_ledger_account(r) for r in rows]
    points = flows.net_worth_history(accounts, txns, today - timedelta(days=days - 1), today)
    return NetWorthHistoryOut(
        points=[HistoryPointOut(on=d, net_worth_paise=v) for d, v in points],
        history_starts=flows.history_start(txns),
    )
