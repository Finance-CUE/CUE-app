"""Groups: shared expenses and settlements (dashboard spec P3, sections 5 and 8). Pure: no I/O.

Members are names the user typed; one of them is the user ("is_me"). Each
member's balance is what they paid (expenses and settlements out) minus their
shares (and settlements in). Positive: the group owes them; negative: they owe.

Only the user's side reaches the ledger, with Khata's types (section 8):
  I paid T, my share S    expense S + lend (T - S), from my account
  someone else paid       expense S + borrow S, no account moves
  I receive a settlement  repayment_received into my account
  I pay a settlement      repayment_made from my account
"""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

Split = Literal["equal", "exact"]


@dataclass(frozen=True)
class Expense:
    id: str
    paid_by: str
    amount_paise: int
    shares: dict[str, int]  # member id -> share


@dataclass(frozen=True)
class Settlement:
    id: str
    from_member: str
    to_member: str
    amount_paise: int


def equal_shares(amount_paise: int, members: list[str]) -> dict[str, int]:
    """Split evenly; the leftover paise go one each to the first members, so the
    shares always add up to the amount."""
    if not members:
        raise ValueError("Choose at least one person to split with.")
    base, extra = divmod(amount_paise, len(members))
    return {m: base + (1 if i < extra else 0) for i, m in enumerate(members)}


def exact_shares(amount_paise: int, shares: dict[str, int]) -> dict[str, int]:
    """Typed amounts; they must add up to the total exactly."""
    if any(v < 0 for v in shares.values()):
        raise ValueError("Shares can't be negative.")
    total = sum(shares.values())
    if total != amount_paise:
        diff = amount_paise - total
        word = "short" if diff > 0 else "over"
        raise ValueError(f"The shares are ₹{abs(diff) / 100:,.2f} {word} of the total.")
    if not any(v > 0 for v in shares.values()):
        raise ValueError("Give at least one person a share.")
    return {m: v for m, v in shares.items() if v > 0}


def balances(members: Iterable[str], expenses: Iterable[Expense], settlements: Iterable[Settlement]) -> dict[str, int]:
    """Each member's balance: positive is owed to them, negative they owe. Sums to zero."""
    out = {m: 0 for m in members}
    for e in expenses:
        out[e.paid_by] = out.get(e.paid_by, 0) + e.amount_paise
        for m, s in e.shares.items():
            out[m] = out.get(m, 0) - s
    for s in settlements:
        out[s.from_member] = out.get(s.from_member, 0) + s.amount_paise
        out[s.to_member] = out.get(s.to_member, 0) - s.amount_paise
    return out


def settle_up(bal: dict[str, int]) -> list[tuple[str, str, int]]:
    """Who pays whom to settle everything, in few payments: (from, to, amount).
    The largest debtor pays the largest creditor, repeatedly."""
    debtors = sorted(((-v, m) for m, v in bal.items() if v < 0), reverse=True)
    creditors = sorted(((v, m) for m, v in bal.items() if v > 0), reverse=True)
    out: list[tuple[str, str, int]] = []
    i = j = 0
    debt = [list(d) for d in debtors]
    cred = [list(c) for c in creditors]
    while i < len(debt) and j < len(cred):
        pay = min(debt[i][0], cred[j][0])
        out.append((debt[i][1], cred[j][1], pay))
        debt[i][0] -= pay
        cred[j][0] -= pay
        if debt[i][0] == 0:
            i += 1
        if cred[j][0] == 0:
            j += 1
    return out


# The user's ledger rows ----------------------------------------------------------------


def expense_rows(me: str, e: Expense, account_id: str | None, description: str, category: str) -> list[dict]:
    """The ledger rows for the user's side of one group expense."""
    mine = e.shares.get(me, 0)
    rows: list[dict] = []
    if e.paid_by == me:
        if account_id is None:
            raise ValueError("Choose the account you paid from.")
        if mine > 0:
            rows.append({"type": "expense", "amount_paise": mine, "account_id": account_id,
                         "category": category, "description": description})  # fmt: skip
        if e.amount_paise - mine > 0:
            rows.append({"type": "lend", "amount_paise": e.amount_paise - mine, "account_id": account_id,
                         "category": None, "description": description})  # fmt: skip
    elif mine > 0:
        rows.append({"type": "expense", "amount_paise": mine, "account_id": None,
                     "category": category, "description": description})  # fmt: skip
        rows.append({"type": "borrow", "amount_paise": mine, "account_id": None,
                     "category": None, "description": description})  # fmt: skip
    return rows


def settlement_rows(me: str, s: Settlement, account_id: str | None, description: str) -> list[dict]:
    """The ledger row for a settlement the user paid or received; none between two others."""
    if me not in (s.from_member, s.to_member):
        return []
    if account_id is None:
        raise ValueError("Choose the account the money moved through.")
    kind = "repayment_received" if s.to_member == me else "repayment_made"
    return [{"type": kind, "amount_paise": s.amount_paise, "account_id": account_id, "description": description}]
