"""Groups: shared expenses and settlements (dashboard spec P3).

Members are names the user types; the user is "You". The group screen shows
everyone's balance and who pays whom; only the user's side reaches the ledger
(groups.py has the rules), so net worth counts what the groups owe the user and
what the user owes them, apart from personal Khata.
"""

from datetime import UTC, date, datetime

from fastapi import APIRouter, Request, Response, status

from app.features.assessment.router import UserId
from app.features.auth.router import limiter
from app.features.money import groups as G
from app.features.money.ledger_repository import LedgerRepository
from app.features.money.ledger_router import EntityId, Repo, Today, _active_account_ids, _fail
from app.features.money.ledger_schemas import (
    GroupCreate,
    GroupDetailOut,
    GroupExpenseIn,
    GroupExpenseOut,
    GroupMemberOut,
    GroupOut,
    GroupSettlementIn,
    GroupSettlementOut,
    GroupsOut,
    GroupUpdate,
    SettleStepOut,
)
from app.features.money.repository import MoneyConflictError

router = APIRouter(prefix="/money/groups", tags=["groups"])


def _gone():
    return _fail(status.HTTP_404_NOT_FOUND, "This group no longer exists. Pull down to refresh.")


def _bad(detail: str):
    return _fail(status.HTTP_422_UNPROCESSABLE_CONTENT, detail)


class _Book:
    """One user's groups, members, expenses and settlements, loaded once."""

    def __init__(self, groups: list[dict], members: list[dict], expenses: list[dict], settlements: list[dict]):
        self.groups = {g["id"]: g for g in groups}
        self.members = members
        self.expenses = expenses
        self.settlements = settlements

    def members_of(self, group_id: str, live_only: bool = False) -> list[dict]:
        return [m for m in self.members if m["group_id"] == group_id and not (live_only and m.get("removed_at"))]

    def me(self, group_id: str) -> str:
        return next(m["id"] for m in self.members_of(group_id) if m["is_me"])

    def expenses_of(self, group_id: str) -> list[dict]:
        return [e for e in self.expenses if e["group_id"] == group_id]

    def settlements_of(self, group_id: str) -> list[dict]:
        return [s for s in self.settlements if s["group_id"] == group_id]

    def balances(self, group_id: str) -> dict[str, int]:
        return G.balances(
            [m["id"] for m in self.members_of(group_id)],
            [_expense(e) for e in self.expenses_of(group_id)],
            [_settlement(s) for s in self.settlements_of(group_id)],
        )


def _expense(row: dict) -> G.Expense:
    shares = {s["member_id"]: int(s["share_paise"]) for s in row.get("group_expense_shares") or []}
    return G.Expense(id=row["id"], paid_by=row["paid_by"], amount_paise=int(row["amount_paise"]), shares=shares)


def _settlement(row: dict) -> G.Settlement:
    return G.Settlement(row["id"], row["from_member"], row["to_member"], int(row["amount_paise"]))


async def _book(repo: LedgerRepository, user_id: str) -> _Book:
    return _Book(
        await repo.list_groups(user_id),
        await repo.list_group_members(user_id),
        await repo.list_group_expenses(user_id),
        await repo.list_group_settlements(user_id),
    )


def _group_out(row: dict, book: _Book) -> GroupOut:
    return GroupOut(
        id=row["id"],
        name=row["name"],
        icon=row["icon"],
        archived=row.get("archived_at") is not None,
        my_balance_paise=book.balances(row["id"]).get(book.me(row["id"]), 0),
        member_count=len(book.members_of(row["id"], live_only=True)),
        created_at=row["created_at"],
    )


def _live_group(book: _Book, group_id: str) -> dict:
    row = book.groups.get(group_id)
    if row is None or row.get("archived_at"):
        raise _gone()
    return row


async def _check_account(repo: LedgerRepository, user_id: str, account_id) -> str:
    if account_id is None:
        raise _bad("Choose the account the money moved through.")
    if str(account_id) not in await _active_account_ids(repo, user_id):
        raise _bad("That account isn't available. Pull down to refresh.")
    return str(account_id)


def _names_ok(names: list[str], taken: list[str]) -> list[str]:
    seen = {t.strip().casefold() for t in taken}
    out = []
    for n in names:
        key = n.strip().casefold()
        if key in seen or key in ("you", "me"):
            raise _bad(f"{n.strip()} is already in the group.")
        seen.add(key)
        out.append(n.strip())
    return out


# Groups ------------------------------------------------------------------------------


@router.get("")
@limiter.limit("120/minute")
async def list_groups(request: Request, user_id: UserId, repo: Repo) -> GroupsOut:
    """Open groups with the user's balance in each, newest last."""
    book = await _book(repo, user_id)
    groups = [_group_out(g, book) for g in book.groups.values() if not g.get("archived_at")]
    return GroupsOut(
        owed_to_you_paise=sum(g.my_balance_paise for g in groups if g.my_balance_paise > 0),
        you_owe_paise=-sum(g.my_balance_paise for g in groups if g.my_balance_paise < 0),
        groups=groups,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def create_group(request: Request, payload: GroupCreate, user_id: UserId, repo: Repo, response: Response) -> GroupOut:
    names = _names_ok(payload.members, [])
    row, created = await repo.create_group(
        user_id, {"client_key": str(payload.client_key), "name": payload.name, "icon": payload.icon}, names
    )
    if not created:
        response.status_code = status.HTTP_200_OK
    return _group_out(row, await _book(repo, user_id))


@router.get("/{group_id}")
@limiter.limit("120/minute")
async def group_detail(request: Request, group_id: EntityId, user_id: UserId, repo: Repo) -> GroupDetailOut:
    """The group screen: everyone's balance, who pays whom, expenses and settlements."""
    book = await _book(repo, user_id)
    row = book.groups.get(str(group_id))
    if row is None:
        raise _gone()
    me = book.me(row["id"])
    bal = book.balances(row["id"])
    members = [
        GroupMemberOut(
            id=m["id"], name=m["name"], is_me=m["is_me"], removed=m.get("removed_at") is not None,
            balance_paise=bal.get(m["id"], 0),
        )
        for m in book.members_of(row["id"])
    ]  # fmt: skip
    expenses = []
    for e in book.expenses_of(row["id"]):
        x = _expense(e)
        expenses.append(
            GroupExpenseOut(
                id=e["id"], description=e["description"], category=e["category"], amount_paise=x.amount_paise,
                paid_by=x.paid_by, split=e["split"], shares=x.shares, my_share_paise=x.shares.get(me, 0),
                occurred_on=e["occurred_on"], note=e.get("note"), account_id=e.get("account_id"),
                created_at=e["created_at"],
            )
        )  # fmt: skip
    settlements = [
        GroupSettlementOut(
            id=s["id"], from_member=s["from_member"], to_member=s["to_member"], amount_paise=int(s["amount_paise"]),
            occurred_on=s["occurred_on"], note=s.get("note"), account_id=s.get("account_id"),
            created_at=s["created_at"],
        )
        for s in book.settlements_of(row["id"])
    ]  # fmt: skip
    return GroupDetailOut(
        group=_group_out(row, book),
        members=members,
        settle_up=[SettleStepOut(from_member=f, to_member=t, amount_paise=a) for f, t, a in G.settle_up(bal)],
        expenses=expenses,
        settlements=settlements,
    )


@router.patch("/{group_id}")
@limiter.limit("60/minute")
async def edit_group(request: Request, group_id: EntityId, payload: GroupUpdate, user_id: UserId, repo: Repo) -> GroupOut:
    """Rename, change the icon, add people, or remove someone with nothing in the group."""
    book = await _book(repo, user_id)
    row = _live_group(book, str(group_id))
    live = book.members_of(row["id"], live_only=True)
    names = _names_ok(payload.add_members, [m["name"] for m in live])
    used = {e["paid_by"] for e in book.expenses_of(row["id"])} | {
        mid for e in book.expenses_of(row["id"]) for mid in _expense(e).shares
    } | {s["from_member"] for s in book.settlements_of(row["id"])} | {s["to_member"] for s in book.settlements_of(row["id"])}
    for mid in map(str, payload.remove_members):
        member = next((m for m in live if m["id"] == mid), None)
        if member is None or member["is_me"]:
            raise _bad("That person isn't in this group.")
        if mid in used:
            raise _fail(status.HTTP_409_CONFLICT, f"{member['name']} has expenses in this group, so they stay.")
    try:
        if await repo.update_group(user_id, row["id"], {"name": payload.name, "icon": payload.icon}) is None:
            raise _gone()
        await repo.add_group_members(user_id, row["id"], names)
    except MoneyConflictError:
        raise _fail(status.HTTP_409_CONFLICT, "Someone with that name is already in the group.") from None
    for mid in map(str, payload.remove_members):
        await repo.remove_group_member(user_id, mid)
    return _group_out(row, await _book(repo, user_id))


@router.post("/{group_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def archive_group(request: Request, group_id: EntityId, user_id: UserId, repo: Repo) -> Response:
    """Only once everyone is settled up, so no balance disappears."""
    book = await _book(repo, user_id)
    row = _live_group(book, str(group_id))
    if any(v != 0 for v in book.balances(row["id"]).values()):
        raise _fail(status.HTTP_409_CONFLICT, "Settle up first. Only a group where everyone is square can be archived.")
    await repo.update_group(user_id, row["id"], {"archived_at": datetime.now(UTC).isoformat()})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Expenses -----------------------------------------------------------------------------


async def _expense_payload(
    repo: LedgerRepository, user_id: str, book: _Book, group_id: str, data: GroupExpenseIn, today: date
) -> tuple[dict, list[dict], list[dict]]:
    """(expense row, shares, the user's ledger rows), all checked."""
    if data.occurred_on > today:
        raise _bad("The date can't be in the future.")
    live = {m["id"] for m in book.members_of(group_id, live_only=True)}
    if str(data.paid_by) not in live:
        raise _bad("Choose who paid.")
    try:
        if data.split == "equal":
            people = [str(p) for p in data.participants]
            if not people or any(p not in live for p in people) or len(set(people)) != len(people):
                raise ValueError("Choose the people sharing it.")
            shares = G.equal_shares(data.amount_paise, people)
        else:
            if any(k not in live for k in data.shares):
                raise ValueError("Someone in the split isn't in this group.")
            shares = G.exact_shares(data.amount_paise, data.shares)
    except ValueError as exc:
        raise _bad(str(exc)) from None
    me = book.me(group_id)
    account = None
    if str(data.paid_by) == me:
        account = await _check_account(repo, user_id, data.account_id)
    expense = G.Expense(id="", paid_by=str(data.paid_by), amount_paise=data.amount_paise, shares=shares)
    rows = G.expense_rows(me, expense, account, data.description, data.category)
    body = {
        "client_key": str(data.client_key),
        "group_id": group_id,
        "description": data.description,
        "category": data.category,
        "amount_paise": data.amount_paise,
        "paid_by": str(data.paid_by),
        "split": data.split,
        "occurred_on": data.occurred_on.isoformat(),
        "note": data.note,
        "account_id": account,
    }
    return body, [{"member_id": m, "share_paise": v} for m, v in shares.items()], rows


@router.post("/{group_id}/expenses", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def add_expense(
    request: Request, group_id: EntityId, payload: GroupExpenseIn, today: Today, user_id: UserId, repo: Repo
) -> GroupExpenseOut:
    """Quick Add Group Expense. Your share counts as an expense; what others owe you
    is a receivable, what you owe a liability."""
    book = await _book(repo, user_id)
    row = _live_group(book, str(group_id))
    body, shares, txns = await _expense_payload(repo, user_id, book, row["id"], payload, today)
    saved = await repo.put_group_expense(user_id, body, shares, txns)
    if saved is None:
        raise _gone()
    return await _one_expense(repo, user_id, saved["id"])


@router.put("/expenses/{expense_id}")
@limiter.limit("60/minute")
async def edit_expense(
    request: Request, expense_id: EntityId, payload: GroupExpenseIn, today: Today, user_id: UserId, repo: Repo
) -> GroupExpenseOut:
    """Editing recalculates every member's balance and the user's ledger rows."""
    book = await _book(repo, user_id)
    current = next((e for e in book.expenses if e["id"] == str(expense_id)), None)
    if current is None:
        raise _fail(status.HTTP_404_NOT_FOUND, "This expense no longer exists. Pull down to refresh.")
    group = _live_group(book, current["group_id"])
    body, shares, txns = await _expense_payload(repo, user_id, book, group["id"], payload, today)
    saved = await repo.put_group_expense(user_id, {**body, "id": current["id"]}, shares, txns)
    if saved is None:
        raise _fail(status.HTTP_404_NOT_FOUND, "This expense no longer exists. Pull down to refresh.")
    return await _one_expense(repo, user_id, saved["id"])


async def _one_expense(repo: LedgerRepository, user_id: str, expense_id: str) -> GroupExpenseOut:
    book = await _book(repo, user_id)
    e = next(x for x in book.expenses if x["id"] == expense_id)
    x = _expense(e)
    return GroupExpenseOut(
        id=e["id"], description=e["description"], category=e["category"], amount_paise=x.amount_paise,
        paid_by=x.paid_by, split=e["split"], shares=x.shares, my_share_paise=x.shares.get(book.me(e["group_id"]), 0),
        occurred_on=e["occurred_on"], note=e.get("note"), account_id=e.get("account_id"), created_at=e["created_at"],
    )  # fmt: skip


async def _set_deleted(repo, user_id, kind: str, entry_id: str, deleted: bool) -> Response:
    if not await repo.set_group_entry_deleted(user_id, kind, entry_id, deleted):
        raise _fail(status.HTTP_404_NOT_FOUND, "This entry no longer exists. Pull down to refresh.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def delete_expense(request: Request, expense_id: EntityId, user_id: UserId, repo: Repo) -> Response:
    """Deleted but kept, so Undo can bring it back."""
    return await _set_deleted(repo, user_id, "expense", str(expense_id), True)


@router.post("/expenses/{expense_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def restore_expense(request: Request, expense_id: EntityId, user_id: UserId, repo: Repo) -> Response:
    return await _set_deleted(repo, user_id, "expense", str(expense_id), False)


# Settlements ----------------------------------------------------------------------------


@router.post("/{group_id}/settlements", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def add_settlement(
    request: Request, group_id: EntityId, payload: GroupSettlementIn, today: Today, user_id: UserId, repo: Repo
) -> GroupSettlementOut:
    """Quick Add Settlement in a group. Never income or an expense: the money moves
    through the user's account and what is owed goes down."""
    if payload.occurred_on > today:
        raise _bad("The date can't be in the future.")
    book = await _book(repo, user_id)
    row = _live_group(book, str(group_id))
    live = {m["id"]: m for m in book.members_of(row["id"], live_only=True)}
    frm, to = str(payload.from_member), str(payload.to_member)
    if frm not in live or to not in live or frm == to:
        raise _bad("Choose two different people in this group.")
    me = book.me(row["id"])
    account = await _check_account(repo, user_id, payload.account_id) if me in (frm, to) else None
    s = G.Settlement("", frm, to, payload.amount_paise)
    other = live[to if frm == me else frm]["name"]
    desc = f"{other} paid you" if to == me else f"You paid {other}" if frm == me else f"{live[frm]['name']} paid {live[to]['name']}"
    txns = G.settlement_rows(me, s, account, desc)
    saved = await repo.put_group_settlement(
        user_id,
        {
            "client_key": str(payload.client_key), "group_id": row["id"], "from_member": frm, "to_member": to,
            "amount_paise": payload.amount_paise, "occurred_on": payload.occurred_on.isoformat(),
            "note": payload.note, "account_id": account,
        },
        txns,
    )  # fmt: skip
    return GroupSettlementOut(
        id=saved["id"], from_member=saved["from_member"], to_member=saved["to_member"],
        amount_paise=int(saved["amount_paise"]), occurred_on=saved["occurred_on"], note=saved.get("note"),
        account_id=saved.get("account_id"), created_at=saved["created_at"],
    )  # fmt: skip


@router.delete("/settlements/{settlement_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def delete_settlement(request: Request, settlement_id: EntityId, user_id: UserId, repo: Repo) -> Response:
    return await _set_deleted(repo, user_id, "settlement", str(settlement_id), True)


@router.post("/settlements/{settlement_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def restore_settlement(request: Request, settlement_id: EntityId, user_id: UserId, repo: Repo) -> Response:
    return await _set_deleted(repo, user_id, "settlement", str(settlement_id), False)

