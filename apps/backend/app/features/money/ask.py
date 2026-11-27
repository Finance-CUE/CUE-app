"""Ask CUE (dashboard spec P4, sections 3 and 5): a rule-based reader, no AI.

It reads what the user types and either
  - fills an entry ("I spent ₹500 on dinner yesterday using HDFC" -> Expense,
    ₹500, Food & delivery, yesterday, HDFC) that waits for the user to tap Save,
  - answers a question from the user's own data ("How much did I spend on food
    this month?"), or
  - says what it can do.
Nothing is ever saved here. Pure: no I/O; the router passes the data in.

Amounts in answers are written as {{₹<paise>}} tokens; the app swaps them for
its own formatter, so hidden amounts stay hidden.
"""

import re
from dataclasses import dataclass, field
from datetime import date, timedelta

from app.features.money import flows, words

MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
          "november", "december"]  # fmt: skip
SHORT_MONTHS = [m[:3] for m in MONTHS]
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

SUGGESTIONS = [
    "How much did I spend on food this month?",
    "Who owes me money?",
    "What's due this week?",
    "I spent ₹250 on lunch today",
    "Moved ₹5,000 from HDFC to cash",
]


def amt(paise: int) -> str:
    """An amount token the app formats (and masks when amounts are hidden)."""
    return f"{{{{₹{paise}}}}}"


@dataclass(frozen=True)
class AccountInfo:
    id: str
    name: str
    kind: str
    bank: str | None
    balance_paise: int | None


@dataclass(frozen=True)
class Entry:
    """One ledger row as the reader needs it."""

    id: str
    type: str
    amount_paise: int
    occurred_on: date
    category: str | None
    description: str | None
    account_id: str | None


@dataclass(frozen=True)
class Owed:
    person: str
    direction: str  # lent | borrowed
    outstanding_paise: int


@dataclass(frozen=True)
class DueInfo:
    name: str
    amount_paise: int
    due_on: date


@dataclass(frozen=True)
class JarInfo:
    name: str
    saved_paise: int
    target_paise: int
    progress: int


@dataclass
class Context:
    today: date
    accounts: list[AccountInfo]
    entries: list[Entry]
    owed: list[Owed]
    dues: list[DueInfo]
    jars: list[JarInfo]
    net_worth_paise: int
    available_paise: int


@dataclass
class Reply:
    kind: str  # answer | draft | help
    text: str
    lines: list[str] = field(default_factory=list)
    draft: dict | None = None
    suggestions: list[str] = field(default_factory=list)


# Reading pieces ----------------------------------------------------------------------

_AMOUNT = re.compile(
    r"(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(k|thousand|lakh|lakhs|lac|l)?\b(?!\s*(?:st|nd|rd|th)\b)",
    re.IGNORECASE,
)


def read_amount(text: str) -> int | None:
    """"₹1,250" -> 125000 paise; "2k" -> 200000; "1.5 lakh" -> 15000000. Ignores
    day numbers written with a month ("12 nov")."""
    months = "|".join(SHORT_MONTHS)
    cleaned = re.sub(rf"\b\d{{1,2}}\s*(?:{months})[a-z]*\b", " ", text.lower())
    cleaned = re.sub(r"\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b", " ", cleaned)
    for m in _AMOUNT.finditer(cleaned):
        number = float(m.group(1).replace(",", ""))
        unit = (m.group(2) or "").lower()
        if unit in ("k", "thousand"):
            number *= 1_000
        elif unit in ("lakh", "lakhs", "lac", "l"):
            number *= 1_00_000
        paise = round(number * 100)
        if paise > 0:
            return paise
    return None


def read_date(text: str, today: date) -> date:
    """today, yesterday, day before yesterday, a weekday (the last one), "12 nov", "12/11"."""
    t = text.lower()
    if "day before yesterday" in t:
        return today - timedelta(days=2)
    if "yesterday" in t:
        return today - timedelta(days=1)
    for i, name in enumerate(WEEKDAYS):
        if re.search(rf"\b(?:on |last )?{name}\b", t):
            back = (today.weekday() - i) % 7 or 7
            return today - timedelta(days=back)
    m = re.search(rf"\b(\d{{1,2}})\s*({'|'.join(SHORT_MONTHS)})[a-z]*\b", t)
    if m:
        day, month = int(m.group(1)), SHORT_MONTHS.index(m.group(2)) + 1
        year = today.year if (month, day) <= (today.month, today.day) else today.year - 1
        try:
            return date(year, month, day)
        except ValueError:
            return today
    m = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", t)
    if m:
        day, month = int(m.group(1)), int(m.group(2))
        year = int(m.group(3)) if m.group(3) else today.year
        year += 2000 if year < 100 else 0
        try:
            d = date(year, month, day)
            return d if d <= today else today
        except ValueError:
            return today
    return today


def read_accounts(text: str, accounts: list[AccountInfo]) -> list[AccountInfo]:
    """Accounts named in the text, in the order they appear."""
    t = f" {re.sub(r'[^a-z0-9]+', ' ', text.lower())} "
    found: list[tuple[int, AccountInfo]] = []
    for a in accounts:
        names = {a.name.lower(), a.name.lower().split()[0]}
        if a.bank:
            names.add(a.bank.lower())
        if a.kind == "cash":
            names.add("cash")
        if a.kind == "credit_card":
            names |= {"card", "credit card"}
        positions = [t.find(f" {n} ") for n in names if len(n) >= 2 and f" {n} " in t]
        if positions:
            found.append((min(positions), a))
    return [a for _, a in sorted(found, key=lambda x: x[0])]


def _person_after(text: str, word: str) -> str | None:
    m = re.search(rf"\b{word}\s+([A-Za-z][A-Za-z]+(?:\s+[A-Z][a-z]+)?)", text)
    if not m:
        return None
    name = m.group(1).strip()
    return None if name.lower() in {"my", "the", "a", "cash", "bank", "hdfc", "sbi", "icici"} else name.title()


def _description(text: str, accounts: list[AccountInfo]) -> str | None:
    """What it was for: words after "on" / "for" (or the leftovers), minus amounts,
    dates, accounts and filler."""
    t = text.lower()
    m = re.search(r"\b(?:on|for|at)\s+(.+)", t)
    rest = m.group(1) if m else t
    drop = {"i", "spent", "spend", "paid", "pay", "bought", "buy", "using", "with", "via", "from", "by", "today",
            "yesterday", "day", "before", "the", "a", "an", "my", "rs", "inr", "rupees", "on", "for", "at", "upi",
            "card", "cash", "last"} | set(WEEKDAYS) | set(SHORT_MONTHS) | set(MONTHS)  # fmt: skip
    for a in accounts:
        drop |= set(a.name.lower().split()) | ({a.bank.lower()} if a.bank else set())
    kept = [w for w in re.sub(r"[^a-z\s]", " ", rest).split() if w not in drop and not w.isdigit() and len(w) > 1]
    return " ".join(kept[:4]).capitalize() or None


# Drafts (the user still taps Save) ---------------------------------------------------------


def _draft(ctx: Context, text: str) -> Reply | None:
    t = text.lower()
    amount = read_amount(text)
    if amount is None:
        return None
    on = read_date(text, ctx.today)
    named = read_accounts(text, ctx.accounts)
    when = (
        "today" if on == ctx.today
        else "yesterday" if on == ctx.today - timedelta(days=1)
        else f"{on.day} {SHORT_MONTHS[on.month - 1].title()}"
    )  # fmt: skip

    if re.search(r"\b(transfer(?:red)?|moved?|sent|shifted)\b", t) and len(named) >= 2:
        frm, to = named[0], named[1]
        return Reply("draft", f"Transfer {amt(amount)} from {frm.name} to {to.name}, {when}. Check it and tap Save.",
                     draft={"type": "transfer", "amount_paise": amount, "account_id": frm.id, "to_account_id": to.id,
                            "occurred_on": on.isoformat()})  # fmt: skip

    if re.search(r"\b(lent|lend|gave)\b", t):
        person = _person_after(text, "to")
        if person:
            account = named[0] if named else next((a for a in ctx.accounts if a.kind == "cash"), None)
            return Reply("draft", f"Lend {amt(amount)} to {person}, {when}. Check it and tap Save.",
                         draft={"type": "lend", "amount_paise": amount, "person": person,
                                "account_id": account.id if account else None, "occurred_on": on.isoformat()})  # fmt: skip

    if re.search(r"\b(borrowed|borrow|took)\b", t):
        person = _person_after(text, "from")
        if person:
            account = named[0] if named else next((a for a in ctx.accounts if a.kind == "cash"), None)
            return Reply("draft", f"Borrow {amt(amount)} from {person}, {when}. Check it and tap Save.",
                         draft={"type": "borrow", "amount_paise": amount, "person": person,
                                "account_id": account.id if account else None, "occurred_on": on.isoformat()})  # fmt: skip

    if re.search(r"\b(received|got|earned|salary|income|credited|freelance|refund|interest|dividend)\b", t):
        category = words.suggest_income(text) or "other"
        account = named[0] if named else next((a for a in ctx.accounts if a.kind in ("savings", "current")), None)
        label = words.CATEGORY_LABELS.get(category, "Income")
        return Reply("draft", f"Income {amt(amount)} · {label}, {when}{f' into {account.name}' if account else ''}. Check it and tap Save.",
                     draft={"type": "income", "amount_paise": amount, "category": category,
                            "description": _description(text, ctx.accounts) or label,
                            "account_id": account.id if account else None, "occurred_on": on.isoformat()})  # fmt: skip

    description = _description(text, ctx.accounts)
    category = words.suggest_expense(text) or "other"
    account = named[0] if named else None
    label = words.CATEGORY_LABELS[category]
    return Reply("draft", f"Expense {amt(amount)} · {label}, {when}{f' from {account.name}' if account else ''}. Check it and tap Save.",
                 draft={"type": "expense", "amount_paise": amount, "category": category, "description": description,
                        "account_id": account.id if account else None, "occurred_on": on.isoformat()})  # fmt: skip


# Questions -------------------------------------------------------------------------------


def read_period(text: str, today: date) -> tuple[date, date, str]:
    t = text.lower()
    if "today" in t:
        return today, today, "today"
    if "yesterday" in t:
        y = today - timedelta(days=1)
        return y, y, "yesterday"
    monday = today - timedelta(days=today.weekday())
    if "last week" in t:
        return monday - timedelta(days=7), monday - timedelta(days=1), "last week"
    if "this week" in t or re.search(r"\bweek\b", t):
        return monday, today, "this week"
    first = today.replace(day=1)
    if "last month" in t:
        prev = (first - timedelta(days=1)).replace(day=1)
        return prev, first - timedelta(days=1), "last month"
    if "this year" in t:
        return today.replace(month=1, day=1), today, "this year"
    for i, name in enumerate(MONTHS):
        if re.search(rf"\b(?:in )?({name}|{name[:3]})\b", t) and not re.search(rf"\d\s*{name[:3]}", t):
            year = today.year if i + 1 <= today.month else today.year - 1
            start = date(year, i + 1, 1)
            return start, min(flows.month_end(start), today), name.title()
    return first, today, "this month"


def _category_in(text: str) -> str | None:
    t = f" {text.lower()} "
    for name, cat in sorted(words.CATEGORY_NAMES.items(), key=lambda kv: -len(kv[0])):
        if f" {name} " in t or f" {name}?" in t:
            return cat
    return None


def _ledger(ctx: Context):
    from app.features.money.ledger import Txn

    return [Txn(e.id, e.type, e.amount_paise, e.occurred_on, ctx.today, e.account_id, category=e.category)  # type: ignore[arg-type]
            for e in ctx.entries]  # fmt: skip


def _answer(ctx: Context, text: str) -> Reply | None:
    t = text.lower()
    start, end, label = read_period(text, ctx.today)
    txns = _ledger(ctx)

    if re.search(r"\bnet ?worth\b|\bworth\b", t):
        return Reply("answer", f"Your net worth is {amt(ctx.net_worth_paise)}.",
                     lines=[f"Available balance {amt(ctx.available_paise)}"])  # fmt: skip

    if re.search(r"\b(who owes|owes? me|owed to me|pending from|lent)\b", t):
        mine = [o for o in ctx.owed if o.direction == "lent" and o.outstanding_paise > 0]
        person = next((o.person for o in ctx.owed if o.person.lower() in t), None)
        if person:
            total = sum(o.outstanding_paise for o in mine if o.person.lower() == person.lower())
            return Reply("answer", f"{person} owes you {amt(total)}." if total else f"{person} doesn't owe you anything right now.")
        if not mine:
            return Reply("answer", "No one owes you anything right now.")
        by: dict[str, int] = {}
        for o in mine:
            by[o.person] = by.get(o.person, 0) + o.outstanding_paise
        return Reply("answer", f"{len(by)} {'person owes' if len(by) == 1 else 'people owe'} you {amt(sum(by.values()))}.",
                     lines=[f"{p}: {amt(v)}" for p, v in sorted(by.items(), key=lambda kv: -kv[1])])  # fmt: skip

    if re.search(r"\b(do i owe|i owe|borrowed)\b", t):
        mine = [o for o in ctx.owed if o.direction == "borrowed" and o.outstanding_paise > 0]
        if not mine:
            return Reply("answer", "You don't owe anyone right now.")
        by = {}
        for o in mine:
            by[o.person] = by.get(o.person, 0) + o.outstanding_paise
        return Reply("answer", f"You owe {amt(sum(by.values()))}.", lines=[f"{p}: {amt(v)}" for p, v in by.items()])

    if re.search(r"\b(due|bills?|upcoming|subscriptions?|emi|rent)\b", t) and not re.search(r"\bspen[dt]", t):
        horizon = ctx.today + timedelta(days=7 if "week" in t else 30)
        soon = sorted((d for d in ctx.dues if ctx.today <= d.due_on <= horizon), key=lambda d: d.due_on)
        span = "this week" if "week" in t else "in the next 30 days"
        if not soon:
            return Reply("answer", f"Nothing is due {span}.")
        return Reply("answer", f"{amt(sum(d.amount_paise for d in soon))} due {span}.",
                     lines=[f"{d.name}: {amt(d.amount_paise)} on {d.due_on.day} {SHORT_MONTHS[d.due_on.month - 1].title()}" for d in soon])  # fmt: skip

    if re.search(r"\b(jar|jars|goal|goals|saving for)\b", t):
        if not ctx.jars:
            return Reply("answer", "You have no Goal Jars yet. Create one from Today.")
        named = [j for j in ctx.jars if j.name.lower() in t]
        js = named or ctx.jars
        return Reply("answer", f"{amt(sum(j.saved_paise for j in js))} set aside across {len(js)} {'jar' if len(js) == 1 else 'jars'}.",
                     lines=[f"{j.name}: {amt(j.saved_paise)} of {amt(j.target_paise)} ({j.progress}%)" for j in js])  # fmt: skip

    if re.search(r"\b(balance|how much (?:money )?(?:is |do i have )?in|in my)\b", t) or re.search(r"\bhow much (?:money )?do i have\b", t):
        named = read_accounts(text, ctx.accounts)
        if named:
            return Reply("answer", " ".join(f"{a.name} has {amt(a.balance_paise or 0)}." for a in named))
        return Reply("answer", f"Your available balance is {amt(ctx.available_paise)}.",
                     lines=[f"{a.name}: {amt(a.balance_paise or 0)}" for a in ctx.accounts if a.balance_paise is not None])  # fmt: skip

    if re.search(r"\b(biggest|largest|most expensive|top)\b", t):
        spends = sorted((e for e in ctx.entries if e.type == "expense" and start <= e.occurred_on <= end), key=lambda e: -e.amount_paise)[:3]
        if not spends:
            return Reply("answer", f"No spending logged {label}.")
        return Reply("answer", f"Your biggest spend {label}: {spends[0].description or words.CATEGORY_LABELS.get(spends[0].category or 'other')}, {amt(spends[0].amount_paise)}.",
                     lines=[f"{e.description or words.CATEGORY_LABELS.get(e.category or 'other')}: {amt(e.amount_paise)}" for e in spends])  # fmt: skip

    if re.search(r"\b(compare|vs|versus|than last month|more than|less than)\b", t):
        cat = _category_in(text)
        first = ctx.today.replace(day=1)
        ls, le = flows.same_days_last_month(ctx.today)
        now = flows.by_category(txns, first, ctx.today).get(cat, 0) if cat else flows.expenses_between(txns, first, ctx.today)
        then = flows.by_category(txns, ls, le).get(cat, 0) if cat else flows.expenses_between(txns, ls, le)
        what = words.CATEGORY_LABELS[cat] if cat else "Spending"
        if then == 0:
            return Reply("answer", f"{what}: {amt(now)} so far this month, nothing on the same days last month.")
        diff = now - then
        direction = "up" if diff > 0 else "down" if diff < 0 else "level"
        pct = round(abs(diff) * 100 / then)
        return Reply("answer", f"{what} is {direction}{f' {pct}%' if diff else ''}: {amt(now)} this month against {amt(then)} on the same days last month.")

    if re.search(r"\b(save|saved|saving|savings)\b", t):
        income, _ = flows.income_between(txns, start, end)
        spent = flows.expenses_between(txns, start, end)
        saved = income - spent
        rate = flows.savings_rate(income, saved)
        return Reply("answer", f"You saved {amt(saved)} {label}." if saved >= 0 else f"You spent {amt(-saved)} more than came in {label}.",
                     lines=[f"Income {amt(income)}", f"Expenses {amt(spent)}"] + ([f"Savings rate {rate}%"] if rate is not None else []))  # fmt: skip

    if re.search(r"\b(earn|earned|income|received|salary|made)\b", t):
        income, salary = flows.income_between(txns, start, end)
        return Reply("answer", f"You received {amt(income)} {label}.", lines=[f"Salary {amt(salary)}", f"Other {amt(income - salary)}"] if income else [])

    if re.search(r"\b(spen[dt]|spending|expenses?|cost|paid)\b", t) or _category_in(text):
        cat = _category_in(text)
        if cat:
            total = flows.by_category(txns, start, end).get(cat, 0)
            return Reply("answer", f"You spent {amt(total)} on {words.CATEGORY_LABELS[cat]} {label}.")
        total = flows.expenses_between(txns, start, end)
        top = list(flows.by_category(txns, start, end).items())[:3]
        return Reply("answer", f"You spent {amt(total)} {label}.", lines=[f"{words.CATEGORY_LABELS.get(c, c)}: {amt(p)}" for c, p in top])

    return None


def _is_question(text: str) -> bool:
    t = text.strip().lower()
    return t.endswith("?") or bool(re.match(r"^(how|what|who|when|which|where|show|list|tell|am i|is|do i|did i|have i|are|can)\b", t))


def ask(ctx: Context, text: str) -> Reply:
    """The reader. A question is answered; a sentence with an amount becomes a draft."""
    text = text.strip()
    if not text:
        return Reply("help", "Ask about your money, or tell CUE what happened.", suggestions=SUGGESTIONS)
    if _is_question(text):
        reply = _answer(ctx, text)
        if reply:
            return reply
    draft = _draft(ctx, text)
    if draft:
        return draft
    reply = _answer(ctx, text)
    if reply:
        return reply
    return Reply(
        "help",
        "CUE couldn't read that yet. Try a question about spending, income, savings, dues, jars or who owes you, "
        "or tell CUE an amount and what it was for.",
        suggestions=SUGGESTIONS,
    )
