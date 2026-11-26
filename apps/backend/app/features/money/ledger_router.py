"""Account ledger endpoints (dashboard spec P0): accounts, entries and net worth.

Every figure is worked out on the server by app.features.money.ledger from the
whole ledger; the app only displays it. `today` is the user's local date, as on
the subscription routes. The user is always the verified token subject.
"""

import uuid
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from app.features.assessment.router import UserId
from app.features.auth.router import limiter
from app.features.money import ledger
from app.features.money.ledger_repository import (
    LedgerRepository,
    to_ledger_account,
    to_ledger_txn,
)
from app.features.money.ledger_schemas import (
    AccountCreate,
    AccountDetailOut,
    AccountMonthOut,
    AccountOut,
    AccountUpdate,
    AdjustRequest,
    EntryCreate,
    EntryType,
    EntryUpdate,
    NetWorthOut,
    PositionOut,
    TransactionOut,
    TxnType,
)
from app.features.money.repository import MoneyConflictError
from app.features.money.schemas import MAX_DATE, MIN_DATE

router = APIRouter(prefix="/money", tags=["ledger"])

MAX_HISTORY_DAYS = 366  # inclusive days per page of transaction history
EDITABLE: frozenset[str] = frozenset(EntryType.__args__)
# Adjustments can be undone too; openings and Khata rows cannot be deleted here.
DELETABLE: frozenset[str] = EDITABLE | {"adjustment"}

Today = Annotated[date, Query(ge=MIN_DATE, le=MAX_DATE)]
EntityId = uuid.UUID


def get_ledger_repo(request: Request) -> LedgerRepository:
    return request.app.state.money_repo


Repo = Annotated[LedgerRepository, Depends(get_ledger_repo)]


def _fail(code: int, detail: str) -> HTTPException:
    return HTTPException(status_code=code, detail=detail)


def _gone() -> HTTPException:
    return _fail(status.HTTP_404_NOT_FOUND, "This entry no longer exists. Pull down to refresh.")


def _txn_out(row: dict) -> TransactionOut:
    fields = {k: row.get(k) for k in TransactionOut.model_fields if k != "deleted"}
    return TransactionOut(**fields, deleted=row.get("deleted_at") is not None)


def _account_out(row: dict, balance: int | None) -> AccountOut:
    return AccountOut(
        id=row["id"],
        name=row["name"],
        kind=row["kind"],
        bank=row.get("bank"),
        icon=row.get("icon"),
        archived=row.get("archived_at") is not None,
        balance_paise=balance,
        created_at=row["created_at"],
    )


def _sorted_accounts(accounts: list[AccountOut]) -> list[AccountOut]:
    """Section 4.5: largest balance first with cash last; cards and loans after."""
    return sorted(
        accounts,
        key=lambda a: (a.kind == "credit_card", a.kind == "cash", -(a.balance_paise or 0), a.name),
    )


def _position_out(pos: ledger.Position, on: date) -> PositionOut:
    return PositionOut(
        on=on,
        available_paise=pos.available_paise,
        other_assets_paise=pos.other_assets_paise,
        receivables_paise=pos.receivables_paise,
        card_dues_paise=pos.card_dues_paise,
        borrowings_paise=pos.borrowings_paise,
        other_liabilities_paise=pos.other_liabilities_paise,
        total_assets_paise=pos.total_assets_paise,
        total_liabilities_paise=pos.total_liabilities_paise,
        net_worth_paise=pos.net_worth_paise,
    )


async def _load(repo: LedgerRepository, user_id: str) -> tuple[list[dict], list[ledger.Txn]]:
    accounts = await repo.list_accounts(user_id)
    txns = [to_ledger_txn(r) for r in await repo.list_transactions(user_id)]
    return accounts, txns


async def _active_account_ids(repo: LedgerRepository, user_id: str) -> set[str]:
    return {a["id"] for a in await repo.list_accounts(user_id) if a.get("archived_at") is None}


async def _check_entry(
    repo: LedgerRepository, user_id: str, type_: str, data: EntryCreate | EntryUpdate
) -> None:
    """Fields valid for the type, accounts the user's and open, a refund's expense the user's."""
    try:
        data._check(type_)
    except ValueError as exc:
        raise _fail(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from None
    active = await _active_account_ids(repo, user_id)
    for account_id in (data.account_id, data.to_account_id):
        if account_id is not None and str(account_id) not in active:
            raise _fail(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "That account isn't available. Pull down to refresh.",
            )
    if data.refund_of is not None:
        original = await repo.get_transaction(user_id, str(data.refund_of))
        if original is None or original["type"] != "expense" or original.get("deleted_at"):
            raise _fail(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "That expense no longer exists."
            )


def _entry_body(data: EntryCreate | EntryUpdate) -> dict:
    return data.model_dump(mode="json", exclude={"type"})


# The scheduled item a repeating expense becomes, by its category.
_REPEAT_KIND = {"subscriptions": "subscription", "bills": "bill"}


async def _repeat_item(repo: LedgerRepository, user_id: str, payload: EntryCreate) -> str:
    """Quick Add with "recurring" on: the scheduled item the entry belongs to, next
    due on repeat.next_on. Shares the entry's client key, so a retry reuses it."""
    repeat = payload.repeat
    assert repeat is not None
    category = payload.category or "other"
    kind = "income" if payload.type == "income" else _REPEAT_KIND.get(category, "other")
    try:
        row, _ = await repo.create_schedule(
            user_id,
            {
                "client_key": str(payload.client_key),
                "kind": kind,
                "name": payload.description or category.replace("_", " ").capitalize(),
                "amount_paise": payload.amount_paise,
                "frequency": repeat.frequency,
                "first_due_on": repeat.next_on.isoformat(),
                "billing_day": repeat.next_on.day,
                "starts_on": (repeat.next_on - timedelta(days=1)).isoformat(),
                "account_id": str(payload.account_id),
                "category": category,
                "variable": repeat.variable,
                "reminder": True,
            },
        )
    except MoneyConflictError:
        raise _fail(
            status.HTTP_409_CONFLICT,
            "Something with that name already repeats. Mark it paid from Coming up, "
            "or turn off Recurring.",
        ) from None
    return row["id"]


# Accounts -------------------------------------------------------------------------


@router.get("/accounts")
@limiter.limit("120/minute")
async def list_accounts(request: Request, today: Today, user_id: UserId, repo: Repo) -> list[AccountOut]:
    """Open accounts with today's balance, in the order Today shows them."""
    rows, txns = await _load(repo, user_id)
    balances = ledger.account_balances_on([to_ledger_account(r) for r in rows], txns, today)
    return _sorted_accounts(
        [_account_out(r, balances.get(r["id"])) for r in rows if r.get("archived_at") is None]
    )


@router.post("/accounts", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def add_account(
    request: Request, payload: AccountCreate, today: Today, user_id: UserId, repo: Repo
) -> AccountOut:
    """The opening balance is saved as an opening transaction, which is not income."""
    if payload.balance_on > today:
        raise _fail(status.HTTP_422_UNPROCESSABLE_CONTENT, "The balance date can't be in the future.")
    opening = -payload.opening_paise if payload.kind == "credit_card" else payload.opening_paise
    try:
        row = await repo.create_account(user_id, payload, opening)
    except MoneyConflictError:
        raise _fail(
            status.HTTP_409_CONFLICT, "You already have an account with that name."
        ) from None
    rows, txns = await _load(repo, user_id)
    balances = ledger.account_balances_on([to_ledger_account(r) for r in rows], txns, today)
    return _account_out(row, balances.get(row["id"]))


@router.get("/accounts/{account_id}")
@limiter.limit("120/minute")
async def account_detail(
    request: Request, account_id: EntityId, today: Today, user_id: UserId, repo: Repo
) -> AccountDetailOut:
    """The account screen: today's balance, money in and out this month, and six months of history."""
    rows, txns = await _load(repo, user_id)
    row = next((r for r in rows if r["id"] == str(account_id)), None)
    if row is None:
        raise _fail(status.HTTP_404_NOT_FOUND, "This account no longer exists. Pull down to refresh.")
    account = to_ledger_account(row)
    months = ledger.account_months(account, txns, today)
    return AccountDetailOut(
        account=_account_out(row, ledger.account_balances_on([account], txns, today)[account.id]),
        money_in_this_month_paise=months[0].money_in,
        money_out_this_month_paise=months[0].money_out,
        months=[
            AccountMonthOut(
                month=m.month,
                money_in_paise=m.money_in,
                money_out_paise=m.money_out,
                closing_paise=m.closing,
            )
            for m in months
        ],
    )


@router.patch("/accounts/{account_id}")
@limiter.limit("60/minute")
async def edit_account(
    request: Request,
    account_id: EntityId,
    payload: AccountUpdate,
    today: Today,
    user_id: UserId,
    repo: Repo,
) -> AccountOut:
    try:
        row = await repo.update_account(user_id, str(account_id), payload)
    except MoneyConflictError:
        raise _fail(
            status.HTTP_409_CONFLICT, "You already have an account with that name."
        ) from None
    if row is None:
        raise _fail(status.HTTP_404_NOT_FOUND, "This account no longer exists. Pull down to refresh.")
    rows, txns = await _load(repo, user_id)
    balances = ledger.account_balances_on([to_ledger_account(r) for r in rows], txns, today)
    return _account_out(row, balances.get(row["id"]))


@router.post("/accounts/{account_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def archive_account(
    request: Request, account_id: EntityId, today: Today, user_id: UserId, repo: Repo
) -> Response:
    """Only at ₹0, so money never vanishes from net worth (suggestion 15)."""
    rows, txns = await _load(repo, user_id)
    row = next((r for r in rows if r["id"] == str(account_id) and r.get("archived_at") is None), None)
    if row is None:
        raise _fail(status.HTTP_404_NOT_FOUND, "This account no longer exists. Pull down to refresh.")
    balance = ledger.account_balances_on([to_ledger_account(row)], txns, today).get(row["id"])
    if not ledger.can_archive(balance):
        raise _fail(
            status.HTTP_409_CONFLICT,
            "Move the balance to another account first. Only an account at ₹0 can be archived.",
        )
    if not await repo.archive_account(user_id, str(account_id)):
        raise _fail(status.HTTP_404_NOT_FOUND, "This account no longer exists. Pull down to refresh.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/accounts/{account_id}/adjust", response_model=TransactionOut)
@limiter.limit("60/minute")
async def adjust_balance(
    request: Request,
    account_id: EntityId,
    payload: AdjustRequest,
    today: Today,
    user_id: UserId,
    repo: Repo,
    response: Response,
):
    """Update balance and Reconcile: the difference is saved as a dated adjustment
    with a reason. Past transactions are never edited. 204 when nothing differs."""
    if payload.occurred_on > today:
        raise _fail(status.HTTP_422_UNPROCESSABLE_CONTENT, "The date can't be in the future.")
    existing = await repo.get_by_client_key(user_id, str(payload.client_key))
    if existing is not None:
        return _txn_out(existing)  # a retry of an adjustment already saved
    rows, txns = await _load(repo, user_id)
    row = next((r for r in rows if r["id"] == str(account_id) and r.get("archived_at") is None), None)
    if row is None:
        raise _fail(status.HTTP_404_NOT_FOUND, "This account no longer exists. Pull down to refresh.")
    calculated = ledger.account_balances_on([to_ledger_account(row)], txns, payload.occurred_on)[row["id"]]
    if calculated is None:
        raise _fail(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Choose a date on or after this account's opening balance.",
        )
    actual = -payload.actual_paise if row["kind"] == "credit_card" else payload.actual_paise
    delta = ledger.reconcile_delta(calculated, actual)
    if delta == 0:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    saved, created = await repo.add_transaction(
        user_id,
        {
            "client_key": str(payload.client_key),
            "type": "adjustment",
            "amount_paise": delta,
            "account_id": row["id"],
            "description": "Balance adjustment",
            "reason": payload.reason,
            "occurred_on": payload.occurred_on.isoformat(),
        },
    )
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return _txn_out(saved)


# Transactions ----------------------------------------------------------------------


@router.get("/transactions")
@limiter.limit("120/minute")
async def list_transactions(
    request: Request,
    start: Annotated[date, Query(ge=MIN_DATE, le=MAX_DATE)],
    end: Annotated[date, Query(ge=MIN_DATE, le=MAX_DATE)],
    user_id: UserId,
    repo: Repo,
    account_id: EntityId | None = None,
    type: Annotated[list[TxnType] | None, Query()] = None,  # noqa: A002 - the API's word
    category: Annotated[str | None, Query(max_length=40)] = None,
    q: Annotated[str | None, Query(max_length=60)] = None,
    recurring: bool = False,
) -> list[TransactionOut]:
    """Transaction history (section 4.9): newest first, filtered and searched."""
    if end < start or (end - start).days >= MAX_HISTORY_DAYS:
        raise _fail(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Choose a date range of at most {MAX_HISTORY_DAYS} days.",
        )
    rows = await repo.list_transactions(user_id, start, end)
    if account_id is not None:
        rows = [r for r in rows if str(account_id) in (r.get("account_id"), r.get("to_account_id"))]
    if type:
        rows = [r for r in rows if r["type"] in type]
    if category:
        rows = [r for r in rows if r.get("category") == category]
    if recurring:
        rows = [r for r in rows if r.get("schedule_id")]
    if q and q.strip():
        # Matched here, not in the store query, so the text never reaches a filter string.
        needle = q.strip().casefold()
        rows = [
            r
            for r in rows
            if any(needle in (r.get(f) or "").casefold() for f in ("description", "note", "category"))
        ]
    return [_txn_out(r) for r in rows]


@router.post("/transactions", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def add_transaction(
    request: Request, payload: EntryCreate, user_id: UserId, repo: Repo, response: Response
) -> TransactionOut:
    """Quick Add: income, expense, transfer or refund. A retry with the same
    client key returns the entry already saved (200) instead of a second one."""
    existing = await repo.get_by_client_key(user_id, str(payload.client_key))
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return _txn_out(existing)
    await _check_entry(repo, user_id, payload.type, payload)
    body = {**_entry_body(payload), "type": payload.type}
    body.pop("repeat", None)
    if payload.repeat is not None:
        body["schedule_id"] = await _repeat_item(repo, user_id, payload)
    row, created = await repo.add_transaction(user_id, body)
    if not created:
        response.status_code = status.HTTP_200_OK
    return _txn_out(row)


@router.patch("/transactions/{txn_id}")
@limiter.limit("60/minute")
async def edit_transaction(
    request: Request, txn_id: EntityId, payload: EntryUpdate, user_id: UserId, repo: Repo
) -> TransactionOut:
    """Any date can be edited; a new date or account moves the entry's effect (rule 8)."""
    current = await repo.get_transaction(user_id, str(txn_id))
    if current is None or current.get("deleted_at"):
        raise _gone()
    if current["type"] not in EDITABLE:
        raise _fail(status.HTTP_422_UNPROCESSABLE_CONTENT, "This entry can't be edited here.")
    await _check_entry(repo, user_id, current["type"], payload)
    row = await repo.update_transaction(user_id, str(txn_id), _entry_body(payload))
    if row is None:
        raise _gone()
    return _txn_out(row)


@router.delete("/transactions/{txn_id}")
@limiter.limit("60/minute")
async def delete_transaction(
    request: Request, txn_id: EntityId, user_id: UserId, repo: Repo
) -> TransactionOut:
    """Deleted but kept, so Undo (POST .../restore) can bring it back."""
    current = await repo.get_transaction(user_id, str(txn_id))
    if current is None or current.get("deleted_at"):
        raise _gone()
    if current["type"] not in DELETABLE:
        raise _fail(status.HTTP_422_UNPROCESSABLE_CONTENT, "This entry can't be deleted here.")
    row = await repo.set_deleted(user_id, str(txn_id), True)
    if row is None:
        raise _gone()
    return _txn_out(row)


@router.post("/transactions/{txn_id}/restore")
@limiter.limit("60/minute")
async def restore_transaction(
    request: Request, txn_id: EntityId, user_id: UserId, repo: Repo
) -> TransactionOut:
    """Undo a delete."""
    row = await repo.set_deleted(user_id, str(txn_id), False)
    if row is None:
        raise _gone()
    return _txn_out(row)


# Net worth ------------------------------------------------------------------------


@router.get("/net-worth")
@limiter.limit("120/minute")
async def net_worth(request: Request, today: Today, user_id: UserId, repo: Repo) -> NetWorthOut:
    """The net worth card and breakdown (sections 4.2 and 4.3)."""
    rows, txns = await _load(repo, user_id)
    accounts = [to_ledger_account(r) for r in rows]
    balances = ledger.account_balances_on(accounts, txns, today)
    pos = ledger.position_on(accounts, txns, today)
    return NetWorthOut(
        **_position_out(pos, today).model_dump(),
        change_this_month_paise=ledger.change_this_month(accounts, txns, today),
        accounts=_sorted_accounts(
            [_account_out(r, balances.get(r["id"])) for r in rows if r.get("archived_at") is None]
        ),
    )


@router.get("/position")
@limiter.limit("120/minute")
async def position(
    request: Request,
    on: Annotated[date, Query(ge=MIN_DATE, le=MAX_DATE)],
    user_id: UserId,
    repo: Repo,
) -> PositionOut:
    """"Your position on <date>": the ledger as it stood at the end of that day."""
    rows, txns = await _load(repo, user_id)
    return _position_out(ledger.position_on([to_ledger_account(r) for r in rows], txns, on), on)
