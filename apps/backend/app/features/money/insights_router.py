"""Intelligence (dashboard spec P4): A note from CUE, Ask CUE and category learning.

The note and Ask CUE read only the user's own ledger. Ask CUE is a rule-based
reader (no AI): it answers questions or fills a form, and never saves anything.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Request, Response, status

from app.features.assessment.router import UserId
from app.features.auth.router import limiter
from app.features.money import ask as A
from app.features.money import jars as J
from app.features.money import ledger, notes, schedule, words
from app.features.money.ledger_repository import (
    LedgerRepository,
    to_jar_move,
    to_ledger_account,
    to_ledger_txn,
    to_schedule_item,
)
from app.features.money.ledger_router import EntityId, Repo, Today, _fail, _txn_out
from app.features.money.ledger_schemas import (
    EXPENSE_CATEGORIES,
    INCOME_CATEGORIES,
    AskOut,
    AskRequest,
    CategoryFix,
    DismissNote,
    MerchantCategoryOut,
    NoteBody,
    NoteOut,
    TransactionOut,
)

router = APIRouter(prefix="/money", tags=["insights"])


async def _open_khata(repo: LedgerRepository, user_id: str, rows: list[dict]) -> list[tuple[str, str, int, date]]:
    """(person, direction, outstanding, since) for open personal Khata entries."""
    repaid: dict[str, int] = {}
    started: dict[str, date] = {}
    for t in rows:
        kid = t.get("khata_entry_id")
        if not kid:
            continue
        if t["type"] in ("repayment_received", "repayment_made"):
            repaid[kid] = repaid.get(kid, 0) + int(t["amount_paise"])
        elif t["type"] in ("lend", "borrow"):
            started[kid] = date.fromisoformat(t["occurred_on"])
    out = []
    for e in await repo.list_open_khata(user_id):
        left = e.amount_paise - repaid.get(e.id, 0)
        if left > 0:
            out.append((e.person, e.direction, left, started.get(e.id, e.created_at.date())))
    return out


async def _jar_states(repo: LedgerRepository, user_id: str) -> list[notes.JarState]:
    moves = [to_jar_move(m) for m in await repo.list_jar_moves(user_id)]
    return [
        notes.JarState(j["id"], j["name"], J.saved(j["id"], moves), int(j["target_paise"]))
        for j in await repo.list_jars(user_id)
        if j["status"] != "archived"
    ]


async def _payments_due(repo: LedgerRepository, user_id: str, start: date, end: date) -> list[schedule.Occurrence]:
    items = [to_schedule_item(r) for r in await repo.list_schedule(user_id)]
    answers = await repo.schedule_answers(user_id)
    return [o for o in schedule.occurrences(items, answers, start, end) if o.status == "due" and schedule.is_payment(o.item)]


# A note from CUE ------------------------------------------------------------------------


@router.get("/note")
@limiter.limit("120/minute")
async def get_note(request: Request, today: Today, user_id: UserId, repo: Repo) -> NoteOut:
    """Today's note (4.10), chosen by the suggestion 19 priority. Serving it counts
    as showing it, so it isn't shown again on another day within 7 days."""
    rows = await repo.list_transactions(user_id)
    txns = [to_ledger_txn(r) for r in rows]
    if not notes.has_enough_data(txns, today):
        return NoteOut(getting_to_know=True, note=None)
    dues = [
        notes.Due(o.item.id, o.item.name, o.item.amount_paise, o.due_on)
        for o in await _payments_due(repo, user_id, today, today + timedelta(days=notes.DUE_WITHIN))
    ]
    owed = [notes.Pending(p, amount, since) for p, d, amount, since in await _open_khata(repo, user_id, rows) if d == "lent"]
    seen = {
        r["note_key"]: notes.Seen(
            date.fromisoformat(r["last_shown_on"]) if r.get("last_shown_on") else None,
            date.fromisoformat(r["dismissed_on"]) if r.get("dismissed_on") else None,
        )
        for r in await repo.list_note_log(user_id)
    }
    note = notes.choose(txns, dues, owed, await _jar_states(repo, user_id), seen, today)
    if note is None:
        return NoteOut(getting_to_know=False, note=None)
    if seen.get(note.key, notes.Seen()).last_shown_on != today:
        await repo.upsert_note_log(user_id, note.key, {"last_shown_on": today.isoformat()})
    details = dict(note.details)
    if "transaction_ids" in details:
        by_id = {r["id"]: r for r in rows}
        details["transactions"] = [
            {"description": by_id[i].get("description"), "amount_paise": int(by_id[i]["amount_paise"]),
             "occurred_on": by_id[i]["occurred_on"]}
            for i in details.pop("transaction_ids") if i in by_id
        ]  # fmt: skip
    return NoteOut(getting_to_know=False, note=NoteBody(key=note.key, kind=note.kind, params=note.params, details=details))


@router.post("/note/dismiss", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def dismiss_note(request: Request, payload: DismissNote, today: Today, user_id: UserId, repo: Repo) -> Response:
    """The small ×: this note goes away for 7 days and the next one shows."""
    await repo.upsert_note_log(user_id, payload.key, {"dismissed_on": today.isoformat()})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Ask CUE ----------------------------------------------------------------------------------


@router.post("/ask")
@limiter.limit("60/minute")
async def ask_cue(request: Request, payload: AskRequest, today: Today, user_id: UserId, repo: Repo) -> AskOut:
    """Answers from the user's own data, or a filled form to check. Never saves."""
    accounts = await repo.list_accounts(user_id)
    rows = await repo.list_transactions(user_id)
    txns = [to_ledger_txn(r) for r in rows]
    balances = ledger.account_balances_on([to_ledger_account(a) for a in accounts], txns, today)
    pos = ledger.position_on([to_ledger_account(a) for a in accounts], txns, today)
    ctx = A.Context(
        today=today,
        accounts=[
            A.AccountInfo(a["id"], a["name"], a["kind"], a.get("bank"), balances.get(a["id"]))
            for a in accounts if a.get("archived_at") is None
        ],  # fmt: skip
        entries=[
            A.Entry(r["id"], r["type"], int(r["amount_paise"]), date.fromisoformat(r["occurred_on"]), r.get("category"),
                    r.get("description"), r.get("account_id"))
            for r in rows
        ],  # fmt: skip
        owed=[A.Owed(p, d, amount) for p, d, amount, _ in await _open_khata(repo, user_id, rows)],
        dues=[A.DueInfo(o.item.name, o.item.amount_paise, o.due_on) for o in await _payments_due(repo, user_id, today, today + timedelta(days=30))],
        jars=[A.JarInfo(j.name, j.saved_paise, j.target_paise, J.progress(j.saved_paise, j.target_paise))
              for j in await _jar_states(repo, user_id)],  # fmt: skip
        net_worth_paise=pos.net_worth_paise,
        available_paise=pos.available_paise,
    )
    reply = A.ask(ctx, payload.query)
    return AskOut(kind=reply.kind, text=reply.text, lines=reply.lines, draft=reply.draft, suggestions=reply.suggestions)


# Category learning ------------------------------------------------------------------------


@router.get("/merchant-categories")
@limiter.limit("120/minute")
async def merchant_categories(request: Request, user_id: UserId, repo: Repo) -> list[MerchantCategoryOut]:
    """"Always put Zepto in Groceries" answers; Quick Add uses them before anything else."""
    return [
        MerchantCategoryOut(merchant=r["merchant"], kind=r["kind"], category=r["category"])
        for r in await repo.list_merchant_categories(user_id)
    ]


@router.post("/transactions/{txn_id}/category")
@limiter.limit("60/minute")
async def fix_category(
    request: Request, txn_id: EntityId, payload: CategoryFix, user_id: UserId, repo: Repo
) -> TransactionOut:
    """Long-press to fix a category (suggestion 18). With remember, the merchant's
    future entries get it too."""
    current = await repo.get_transaction(user_id, str(txn_id))
    if current is None or current.get("deleted_at"):
        raise _fail(status.HTTP_404_NOT_FOUND, "This entry no longer exists. Pull down to refresh.")
    kind = current["type"]
    if kind not in ("expense", "income") or current.get("group_id"):
        raise _fail(status.HTTP_422_UNPROCESSABLE_CONTENT, "Only expenses and income have a category to change.")
    allowed = EXPENSE_CATEGORIES if kind == "expense" else INCOME_CATEGORIES
    if payload.category not in allowed:
        raise _fail(status.HTTP_422_UNPROCESSABLE_CONTENT, "Choose a category.")
    row = await repo.update_transaction(user_id, str(txn_id), {"category": payload.category})
    if row is None:
        raise _fail(status.HTTP_404_NOT_FOUND, "This entry no longer exists. Pull down to refresh.")
    if payload.remember:
        merchant = words.merchant_of(current.get("description"))
        if merchant:
            await repo.upsert_merchant_category(user_id, merchant, kind, payload.category)
    return _txn_out(row)

