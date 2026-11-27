"""Goal Jars (dashboard spec P2, section 4.7).

A jar sets money aside inside an account. Add money and Withdraw only move the
allocation: balances and net worth never change. A jar can't take more than its
account's free balance (balance − other jars on it). Suggested contributions
(weekly, monthly, every payday) wait for the user's approval.
"""

import uuid
from datetime import date

from fastapi import APIRouter, Request, Response, status

from app.features.assessment.router import UserId
from app.features.auth.router import limiter
from app.features.money import jars as J
from app.features.money import ledger, schedule
from app.features.money.ledger_repository import (
    LedgerRepository,
    to_jar,
    to_jar_move,
    to_ledger_account,
    to_schedule_item,
)
from app.features.money.ledger_router import EntityId, Repo, Today, _fail, _load
from app.features.money.ledger_schemas import (
    ContributionAnswer,
    JarCreate,
    JarDetailOut,
    JarFields,
    JarMoveOut,
    JarMoveRequest,
    JarOut,
    JarsOut,
    JarUpdate,
)

router = APIRouter(prefix="/money/jars", tags=["jars"])


def _gone():
    return _fail(status.HTTP_404_NOT_FOUND, "This jar no longer exists. Pull down to refresh.")


class _World:
    """Everything a jar's figures need, loaded once per request."""

    def __init__(self, jars: list[dict], moves: list[dict], balances: dict, kinds: dict, payday: date | None):
        self.rows = {r["id"]: r for r in jars}
        self.moves = [to_jar_move(m) for m in moves]
        self.move_rows = moves
        self.balances = balances
        self.kinds = kinds
        self.payday = payday

    def saved(self, jar_id: str) -> int:
        return J.saved(jar_id, self.moves)

    def in_jars(self) -> dict[str, int]:
        return J.in_jars_by_account(self.moves)

    def free(self, account_id: str) -> int | None:
        return J.free_balance(self.balances.get(account_id), self.in_jars().get(account_id, 0))


async def _world(repo: LedgerRepository, user_id: str, today: date) -> _World:
    accounts, txns = await _load(repo, user_id)
    balances = ledger.account_balances_on([to_ledger_account(a) for a in accounts], txns, today)
    kinds = {a["id"]: (a["kind"], a.get("archived_at") is None, a["name"]) for a in accounts}
    items = [to_schedule_item(r) for r in await repo.list_schedule(user_id)]
    answers = await repo.schedule_answers(user_id)
    paydays = [
        d
        for i in items
        if i.kind == "income" and i.category == "salary" and (d := schedule.next_due(i, answers, today)) is not None
    ]
    return _World(await repo.list_jars(user_id), await repo.list_jar_moves(user_id), balances, kinds, min(paydays, default=None))


def _jar_out(row: dict, w: _World, today: date) -> JarOut:
    jar = to_jar(row)
    saved = w.saved(jar.id)
    balance = w.balances.get(jar.account_id)
    held = w.in_jars().get(jar.account_id, 0)
    return JarOut(
        id=jar.id,
        name=row["name"],
        icon=row["icon"],
        target_paise=jar.target_paise,
        target_date=jar.target_date,
        account_id=jar.account_id,
        method=jar.method,
        contribution_paise=jar.contribution_paise,
        next_contribution_on=jar.next_contribution_on,
        status=jar.status,
        state=J.state(jar, saved, today),
        saved_paise=saved,
        remaining_paise=max(jar.target_paise - saved, 0),
        progress=J.progress(saved, jar.target_paise),
        suggested_monthly_paise=J.suggested_monthly(saved, jar.target_paise, jar.target_date, today),
        behind=J.is_behind(jar, saved, today),
        contribution_due=J.contribution_due(jar, today),
        account_short_paise=max(held - (balance or 0), 0) if held > 0 else 0,
        celebrated=bool(row.get("celebrated")),
        created_at=row["created_at"],
    )


def _move_out(row: dict) -> JarMoveOut:
    return JarMoveOut(
        id=row["id"],
        jar_id=row["jar_id"],
        amount_paise=int(row["amount_paise"]),
        account_id=row["account_id"],
        occurred_on=row["occurred_on"],
        note=row.get("note"),
        auto=bool(row.get("auto")),
        created_at=row["created_at"],
        deleted=row.get("deleted_at") is not None,
    )


def _check_account(w: _World, account_id: str) -> None:
    kind = w.kinds.get(account_id)
    if kind is None or not kind[1]:
        raise _fail(status.HTTP_422_UNPROCESSABLE_CONTENT, "That account isn't available. Pull down to refresh.")
    if kind[0] not in ledger.AVAILABLE_KINDS:
        raise _fail(status.HTTP_422_UNPROCESSABLE_CONTENT, "A jar sets money aside in a bank account or cash.")


def _guard(w: _World, account_id: str, amount: int) -> None:
    """Allocation guard: never more than the account's free balance."""
    free = w.free(account_id)
    if not J.can_add(amount, free):
        name = w.kinds[account_id][2]
        raise _fail(
            status.HTTP_409_CONFLICT,
            f"{name} has only ₹{max(free or 0, 0) / 100:,.0f} free. Add less, or pick another account.",
        )


def _jar_body(data: JarFields, w: _World, today: date) -> dict:
    return {
        "name": data.name,
        "icon": data.icon,
        "target_paise": data.target_paise,
        "target_date": data.target_date.isoformat() if data.target_date else None,
        "account_id": str(data.account_id),
        "method": data.method,
        "contribution_paise": data.contribution_paise if data.method != "manual" else None,
    }


def _first(method: str, today: date, w: _World) -> str | None:
    nxt = J.first_contribution(method, today, w.payday)  # type: ignore[arg-type]
    return nxt.isoformat() if nxt else None


async def _get(repo: LedgerRepository, user_id: str, jar_id: str) -> dict:
    row = next((r for r in await repo.list_jars(user_id) if r["id"] == jar_id), None)
    if row is None:
        raise _gone()
    return row


async def _move(repo, user_id, jar_id, account_id, amount, on: date, note=None, key=None, auto=False) -> dict:
    row, _ = await repo.add_jar_move(
        user_id,
        {
            "client_key": key or str(uuid.uuid4()),
            "jar_id": jar_id,
            "amount_paise": amount,
            "account_id": account_id,
            "occurred_on": on.isoformat(),
            "note": note,
            "auto": auto,
        },
    )
    return row


async def _after_move(repo: LedgerRepository, user_id: str, row: dict, today: date) -> None:
    """Reaching the target completes the jar; dropping below it again reopens it."""
    w = await _world(repo, user_id, today)
    saved = w.saved(row["id"])
    if row["status"] == "active" and saved >= int(row["target_paise"]):
        await repo.update_jar(user_id, row["id"], {"status": "complete", "completed_at": today.isoformat()})
    elif row["status"] == "complete" and saved < int(row["target_paise"]) and not row.get("celebrated"):
        await repo.update_jar(user_id, row["id"], {"status": "active", "completed_at": None})


# Jars -----------------------------------------------------------------------------


@router.get("")
@limiter.limit("120/minute")
async def list_jars(request: Request, today: Today, user_id: UserId, repo: Repo) -> JarsOut:
    """The carousel: jars not archived, in the order they were made."""
    w = await _world(repo, user_id, today)
    jars = [_jar_out(r, w, today) for r in w.rows.values() if r["status"] != "archived"]
    return JarsOut(total_saved_paise=sum(j.saved_paise for j in jars), count=len(jars), jars=jars)


@router.post("", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def create_jar(
    request: Request, payload: JarCreate, today: Today, user_id: UserId, repo: Repo, response: Response
) -> JarOut:
    """Create jar: the goal, its account and an optional first contribution."""
    w = await _world(repo, user_id, today)
    _check_account(w, str(payload.account_id))
    existing = next((r for r in w.rows.values() if r["client_key"] == str(payload.client_key)), None)
    if existing is None and payload.initial_paise:
        _guard(w, str(payload.account_id), payload.initial_paise)
    if payload.method == "payday" and w.payday is None:
        raise _fail(status.HTTP_422_UNPROCESSABLE_CONTENT, "Set up your salary first, so CUE knows your payday.")
    row, created = await repo.create_jar(
        user_id,
        {
            **_jar_body(payload, w, today),
            "client_key": str(payload.client_key),
            "next_contribution_on": _first(payload.method, today, w),
        },
    )
    if payload.initial_paise:
        # Same client key in the moves table: a retry never adds twice.
        await _move(repo, user_id, row["id"], row["account_id"], payload.initial_paise, today,
                    "First contribution", key=str(payload.client_key))  # fmt: skip
        await _after_move(repo, user_id, row, today)
    if not created:
        response.status_code = status.HTTP_200_OK
    w = await _world(repo, user_id, today)
    return _jar_out(w.rows[row["id"]], w, today)


@router.get("/{jar_id}")
@limiter.limit("120/minute")
async def jar_detail(request: Request, jar_id: EntityId, today: Today, user_id: UserId, repo: Repo) -> JarDetailOut:
    """The jar screen: figures and contribution history, newest first."""
    w = await _world(repo, user_id, today)
    row = w.rows.get(str(jar_id))
    if row is None:
        raise _gone()
    moves = [m for m in w.move_rows if m["jar_id"] == row["id"]]
    return JarDetailOut(jar=_jar_out(row, w, today), moves=[_move_out(m) for m in moves])


@router.patch("/{jar_id}")
@limiter.limit("60/minute")
async def edit_jar(
    request: Request, jar_id: EntityId, payload: JarUpdate, today: Today, user_id: UserId, repo: Repo
) -> JarOut:
    """Edit goal. A new account takes the jar's money with it; a new method restarts its suggestions."""
    w = await _world(repo, user_id, today)
    row = w.rows.get(str(jar_id))
    if row is None or row["status"] == "archived":
        raise _gone()
    new_account = str(payload.account_id)
    old_account = row["account_id"]
    _check_account(w, new_account)
    saved = w.saved(row["id"])
    if new_account != old_account and saved > 0:
        _guard(w, new_account, saved)
    if payload.method == "payday" and w.payday is None:
        raise _fail(status.HTTP_422_UNPROCESSABLE_CONTENT, "Set up your salary first, so CUE knows your payday.")
    body = _jar_body(payload, w, today)
    if payload.method != row["method"]:
        body["next_contribution_on"] = _first(payload.method, today, w)
    # A higher target reopens a reached jar.
    if row["status"] == "complete" and saved < payload.target_paise:
        body.update(status="active", completed_at=None, celebrated=False)
    updated = await repo.update_jar(user_id, row["id"], body)
    if updated is None:
        raise _gone()
    if new_account != old_account and saved > 0:
        name = w.kinds[new_account][2]
        await _move(repo, user_id, row["id"], old_account, -saved, today, f"Moved to {name}")
        await _move(repo, user_id, row["id"], new_account, saved, today, f"Moved to {name}")
    w = await _world(repo, user_id, today)
    return _jar_out(w.rows[row["id"]], w, today)


@router.post("/{jar_id}/add", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def add_money(
    request: Request, jar_id: EntityId, payload: JarMoveRequest, today: Today, user_id: UserId, repo: Repo
) -> JarMoveOut:
    """Add money: sets it aside in the jar's account. Balance and net worth stay the same."""
    if payload.occurred_on > today:
        raise _fail(status.HTTP_422_UNPROCESSABLE_CONTENT, "The date can't be in the future.")
    w = await _world(repo, user_id, today)
    row = w.rows.get(str(jar_id))
    if row is None or row["status"] == "archived":
        raise _gone()
    if not any(m["client_key"] == str(payload.client_key) for m in w.move_rows):
        _guard(w, row["account_id"], payload.amount_paise)
    move = await _move(repo, user_id, row["id"], row["account_id"], payload.amount_paise, payload.occurred_on,
                       payload.note, key=str(payload.client_key))  # fmt: skip
    await _after_move(repo, user_id, row, today)
    return _move_out(move)


@router.post("/{jar_id}/withdraw", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def withdraw(
    request: Request, jar_id: EntityId, payload: JarMoveRequest, today: Today, user_id: UserId, repo: Repo
) -> JarMoveOut:
    """Withdraw: releases money back to the account's free balance. Never income."""
    if payload.occurred_on > today:
        raise _fail(status.HTTP_422_UNPROCESSABLE_CONTENT, "The date can't be in the future.")
    w = await _world(repo, user_id, today)
    row = w.rows.get(str(jar_id))
    if row is None or row["status"] == "archived":
        raise _gone()
    retry = any(m["client_key"] == str(payload.client_key) for m in w.move_rows)
    if not retry and payload.amount_paise > w.saved(row["id"]):
        raise _fail(status.HTTP_409_CONFLICT, "That's more than the jar holds.")
    move = await _move(repo, user_id, row["id"], row["account_id"], -payload.amount_paise, payload.occurred_on,
                       payload.note, key=str(payload.client_key))  # fmt: skip
    await _after_move(repo, user_id, row, today)
    return _move_out(move)


@router.post("/{jar_id}/contribution", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def answer_contribution(
    request: Request, jar_id: EntityId, payload: ContributionAnswer, today: Today, user_id: UserId, repo: Repo
) -> Response:
    """Approve or skip a suggested contribution. Nothing is added without approval."""
    w = await _world(repo, user_id, today)
    row = w.rows.get(str(jar_id))
    if row is None or row["status"] == "archived":
        raise _gone()
    if any(m["client_key"] == str(payload.client_key) for m in w.move_rows):
        return Response(status_code=status.HTTP_204_NO_CONTENT)  # a retry of an approval
    jar = to_jar(row)
    if not J.contribution_due(jar, today) or jar.next_contribution_on != payload.due_on:
        raise _fail(status.HTTP_409_CONFLICT, "This suggestion has already been answered. Pull down to refresh.")
    if payload.approve:
        assert jar.contribution_paise is not None
        _guard(w, jar.account_id, jar.contribution_paise)
        await _move(repo, user_id, jar.id, jar.account_id, jar.contribution_paise, today,
                    "Automatic contribution", key=str(payload.client_key), auto=True)  # fmt: skip
    nxt = J.next_contribution(jar.method, today, w.payday)
    await repo.update_jar(user_id, jar.id, {"next_contribution_on": nxt.isoformat() if nxt else None})
    if payload.approve:
        await _after_move(repo, user_id, row, today)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _set_status(repo, user_id, jar_id, allowed: set[str], body: dict) -> Response:
    row = await _get(repo, user_id, jar_id)
    if row["status"] not in allowed:
        raise _fail(status.HTTP_409_CONFLICT, "This jar has changed. Pull down to refresh.")
    if await repo.update_jar(user_id, jar_id, body) is None:
        raise _gone()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{jar_id}/pause", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def pause(request: Request, jar_id: EntityId, user_id: UserId, repo: Repo) -> Response:
    """Pause contributions: no suggestions until resumed. The money stays."""
    return await _set_status(repo, user_id, str(jar_id), {"active"}, {"status": "paused"})


@router.post("/{jar_id}/resume", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def resume(request: Request, jar_id: EntityId, today: Today, user_id: UserId, repo: Repo) -> Response:
    row = await _get(repo, user_id, str(jar_id))
    w = await _world(repo, user_id, today)
    return await _set_status(
        repo, user_id, str(jar_id), {"paused"},
        {"status": "active", "next_contribution_on": _first(row["method"], today, w)},
    )  # fmt: skip


@router.post("/{jar_id}/complete", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def complete(request: Request, jar_id: EntityId, today: Today, user_id: UserId, repo: Repo) -> Response:
    """Mark the goal done. The money stays in the jar until withdrawn."""
    return await _set_status(
        repo, user_id, str(jar_id), {"active", "paused"}, {"status": "complete", "completed_at": today.isoformat()}
    )


@router.post("/{jar_id}/celebrated", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def celebrated(request: Request, jar_id: EntityId, user_id: UserId, repo: Repo) -> Response:
    """The one-time "Reached" celebration was shown."""
    return await _set_status(repo, user_id, str(jar_id), {"complete"}, {"celebrated": True})


@router.post("/{jar_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def archive(request: Request, jar_id: EntityId, today: Today, user_id: UserId, repo: Repo) -> Response:
    """Archive: whatever the jar holds goes back to its account's free balance."""
    w = await _world(repo, user_id, today)
    row = w.rows.get(str(jar_id))
    if row is None or row["status"] == "archived":
        raise _gone()
    saved = w.saved(row["id"])
    if saved > 0:
        await _move(repo, user_id, row["id"], row["account_id"], -saved, today, "Archived: money released")
    if await repo.update_jar(user_id, row["id"], {"status": "archived"}) is None:
        raise _gone()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Undo -------------------------------------------------------------------------------


@router.delete("/moves/{move_id}")
@limiter.limit("60/minute")
async def undo_move(request: Request, move_id: EntityId, today: Today, user_id: UserId, repo: Repo) -> JarMoveOut:
    """Undo an add or withdrawal. Refused when it would leave the jar below ₹0."""
    move = await repo.get_jar_move(user_id, str(move_id))
    if move is None or move.get("deleted_at"):
        raise _fail(status.HTTP_404_NOT_FOUND, "This entry no longer exists. Pull down to refresh.")
    w = await _world(repo, user_id, today)
    row = w.rows.get(move["jar_id"])
    if row is None or row["status"] == "archived":
        raise _gone()
    amount = int(move["amount_paise"])
    if w.saved(row["id"]) - amount < 0:
        raise _fail(status.HTTP_409_CONFLICT, "Undoing this would take the jar below ₹0.")
    if amount < 0:
        # Undoing a withdrawal sets the money aside again: same guard as Add money.
        _guard(w, move["account_id"], -amount)
    undone = await repo.set_jar_move_deleted(user_id, str(move_id), True)
    if undone is None:
        raise _fail(status.HTTP_404_NOT_FOUND, "This entry no longer exists. Pull down to refresh.")
    await _after_move(repo, user_id, row, today)
    return _move_out(undone)
