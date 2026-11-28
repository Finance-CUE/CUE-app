"""Request and response contracts for the account ledger (dashboard spec P0).

Same rules as schemas.py: amounts are integer paise, requests are strict (no
coercion, no unknown fields) and dates arrive as ISO strings.
"""

import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StrictBool, StrictInt, StringConstraints, model_validator

from app.features.money.schemas import (
    MAX_PAISE,
    _BoundedDate,
    _Description,
    _Note,
    _NonNegative,
    _Positive,
    _StrictRequest,
)

AccountKind = Literal["savings", "current", "cash", "credit_card", "other"]

# Section 4.10. Refunds use the expense categories (suggestion 26).
ExpenseCategory = Literal[
    "food_delivery",
    "groceries",
    "transport",
    "shopping",
    "bills",
    "subscriptions",
    "entertainment",
    "health",
    "education",
    "travel",
    "personal_care",
    "other",
]
IncomeCategory = Literal[
    "salary", "business", "freelance", "interest", "dividends", "gifts", "refunds", "other"
]
EXPENSE_CATEGORIES: frozenset[str] = frozenset(ExpenseCategory.__args__)
INCOME_CATEGORIES: frozenset[str] = frozenset(IncomeCategory.__args__)

# What Quick Add can save in P0. Lend and borrow stay on the Khata routes until P3.
EntryType = Literal["income", "expense", "transfer", "refund"]
TxnType = Literal[
    "opening",
    "income",
    "expense",
    "transfer",
    "refund",
    "adjustment",
    "lend",
    "borrow",
    "repayment_received",
    "repayment_made",
]

_AccountName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
_Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9_-]{1,40}$")] | None
_Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
# The balance a user types for a reconcile: a card's is the amount due, so never negative.
_Balance = Annotated[StrictInt, Field(ge=0, le=MAX_PAISE)]
_ClientKey = Annotated[uuid.UUID, Field(strict=False)]
_Id = Annotated[uuid.UUID, Field(strict=False)]


# Requests ------------------------------------------------------------------------


class AccountCreate(_StrictRequest):
    client_key: _ClientKey
    name: _AccountName
    kind: AccountKind
    bank: _Slug = None
    icon: _Slug = None
    # For a credit card, the amount due on balance_on.
    opening_paise: _NonNegative
    balance_on: _BoundedDate


class AccountUpdate(_StrictRequest):
    """Account details. The type cannot change: a card's balance means money due."""

    name: _AccountName
    bank: _Slug = None
    icon: _Slug = None


class AdjustRequest(_StrictRequest):
    """Update balance or Reconcile: the real balance (a card's amount due) and why."""

    client_key: _ClientKey
    actual_paise: _Balance
    reason: _Reason
    occurred_on: _BoundedDate


class EntryFields(_StrictRequest):
    amount_paise: _Positive
    account_id: _Id
    to_account_id: _Id | None = None
    category: str | None = None
    description: _Description | None = None
    note: _Note = None
    occurred_on: _BoundedDate
    refund_of: _Id | None = None

    def _check(self, type_: str) -> None:
        if type_ == "transfer":
            if self.to_account_id is None:
                raise ValueError("Choose the account the money went to.")
            if self.to_account_id == self.account_id:
                raise ValueError("Choose two different accounts.")
            if self.category is not None:
                raise ValueError("Transfers have no category.")
        else:
            if self.to_account_id is not None:
                raise ValueError("Only transfers go to a second account.")
            allowed = INCOME_CATEGORIES if type_ == "income" else EXPENSE_CATEGORIES
            if self.category not in allowed:
                raise ValueError("Choose a category.")
        if self.refund_of is not None and type_ != "refund":
            raise ValueError("Only refunds link to an expense.")


class RepeatFields(_StrictRequest):
    """Quick Add's recurring toggle (spec 5, More options): the entry repeats,
    next on `next_on`. Income may be variable (Mark received asks the amount)."""

    frequency: Literal["monthly", "quarterly", "yearly"]
    next_on: _BoundedDate
    variable: StrictBool = False


class EntryCreate(EntryFields):
    client_key: _ClientKey
    type: EntryType
    repeat: RepeatFields | None = None

    @model_validator(mode="after")
    def _valid_for_type(self):
        self._check(self.type)
        if self.repeat is not None:
            if self.type not in ("income", "expense"):
                raise ValueError("Only income and expenses can repeat.")
            if self.repeat.next_on <= self.occurred_on:
                raise ValueError("The next date must be after this entry's date.")
        return self


class EntryUpdate(EntryFields):
    """Edit an entry. Its type stays; the router checks the fields against it."""


ScheduleKind = Literal["subscription", "bill", "rent", "emi", "other", "income"]
Frequency = Literal["monthly", "quarterly", "yearly", "once"]
_ItemName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class ScheduleFields(_StrictRequest):
    """A subscription, bill, rent, EMI, other payment or recurring income (spec 4.8).
    `next_on` is the next due date; the billing day is its day of the month."""

    kind: ScheduleKind
    name: _ItemName
    amount_paise: _Positive
    frequency: Frequency
    next_on: _BoundedDate
    account_id: _Id
    category: str | None = None
    variable: StrictBool = False
    reminder: StrictBool = True

    @model_validator(mode="after")
    def _category_for_kind(self):
        if self.category is not None:
            allowed = INCOME_CATEGORIES if self.kind == "income" else EXPENSE_CATEGORIES
            if self.category not in allowed:
                raise ValueError("Choose a category.")
        return self


class ScheduleCreate(ScheduleFields):
    client_key: _ClientKey


class ScheduleUpdate(ScheduleFields):
    """Edit an item. A new next date moves every later due date with it."""


class PayRequest(_StrictRequest):
    """Mark paid (or received): the amount is editable for variable bills."""

    client_key: _ClientKey
    due_on: _BoundedDate
    amount_paise: _Positive
    account_id: _Id
    occurred_on: _BoundedDate


class SkipRequest(_StrictRequest):
    due_on: _BoundedDate


# Responses -----------------------------------------------------------------------


class AccountOut(BaseModel):
    id: str
    name: str
    kind: AccountKind
    bank: str | None
    icon: str | None
    archived: bool
    # Negative for a card with money due. None before the "Balance on" date.
    balance_paise: int | None
    created_at: datetime
    # Goal Jars (suggestion 14): money set aside here, and the balance that is left.
    in_jars_paise: int = 0
    free_paise: int | None = None


class TransactionOut(BaseModel):
    id: str
    client_key: str
    type: TxnType
    amount_paise: int
    account_id: str | None
    to_account_id: str | None
    category: str | None
    description: str | None
    note: str | None
    reason: str | None
    khata_entry_id: str | None
    refund_of: str | None
    # The scheduled item it belongs to: a payment marked paid, or an entry saved
    # with "recurring" on (history's Recurring filter).
    schedule_id: str | None = None
    # Group rows (P3): the group, and the expense or settlement they come from.
    group_id: str | None = None
    group_expense_id: str | None = None
    group_settlement_id: str | None = None
    occurred_on: date
    created_at: datetime
    updated_at: datetime
    deleted: bool = False


class PositionOut(BaseModel):
    """Section 8 metrics as the ledger stood at the end of `on`."""

    on: date
    available_paise: int
    other_assets_paise: int
    receivables_paise: int
    card_dues_paise: int
    borrowings_paise: int
    other_liabilities_paise: int
    total_assets_paise: int
    total_liabilities_paise: int
    net_worth_paise: int
    # The breakdown's rows (spec 4.3, suggestion 10): personal Khata and groups apart.
    money_lent_paise: int = 0
    money_borrowed_paise: int = 0
    group_owed_paise: int = 0
    group_owe_paise: int = 0


class AccountMonthOut(BaseModel):
    month: date
    money_in_paise: int
    money_out_paise: int
    # End of that month (today for this month); None before the "Balance on" date.
    closing_paise: int | None


class AccountDetailOut(BaseModel):
    """The account screen (spec 4.5): balance, this month and month by month."""

    account: AccountOut
    money_in_this_month_paise: int
    money_out_this_month_paise: int
    months: list[AccountMonthOut]


class NetWorthOut(PositionOut):
    # None hides the line: no full previous month yet (suggestion 27).
    change_this_month_paise: int | None
    accounts: list[AccountOut]


class ScheduleOut(BaseModel):
    id: str
    kind: ScheduleKind
    name: str
    amount_paise: int
    frequency: Frequency
    billing_day: int
    account_id: str | None
    category: str | None
    variable: bool
    reminder: bool
    active: bool
    # The first unanswered due date from today; None once cancelled or finished.
    next_due_on: date | None
    created_at: datetime


class OccurrenceOut(BaseModel):
    """One due date of a scheduled item. `due` past its date is "Was it paid?"."""

    schedule_id: str
    kind: ScheduleKind
    name: str
    amount_paise: int
    frequency: Frequency
    account_id: str | None
    category: str | None
    variable: bool
    reminder: bool
    due_on: date
    status: Literal["due", "paid", "skipped"]
    transaction_id: str | None


class CategoryOut(BaseModel):
    category: str
    paise: int


class LeftToSpendOut(BaseModel):
    """(Free balance − dues before the next salary) ÷ days until it (section 8)."""

    per_day_paise: int
    free_paise: int
    dues_before_paise: int
    next_salary_on: date


class MonthOut(BaseModel):
    """This month's tiles (4.4), from the 1st to today."""

    month: date
    income_paise: int
    salary_paise: int
    other_income_paise: int
    expenses_paise: int
    daily_average_paise: int
    # 1st to the same day of last month (suggestion 12).
    expenses_same_days_last_month_paise: int
    savings_paise: int
    # None ("—") when there is no income.
    savings_rate: int | None
    dues_paise: int
    dues_count: int
    categories: list[CategoryOut]
    # None hides the line: no salary date yet.
    left_to_spend: LeftToSpendOut | None


class MonthPointOut(BaseModel):
    month: date
    income_paise: int
    salary_paise: int
    expenses_paise: int
    savings_paise: int
    savings_rate: int | None


class BucketOut(BaseModel):
    start: date
    end: date
    income_paise: int
    expenses_paise: int
    count: int


class CashFlowOut(BaseModel):
    """Where your money moves (4.6): transfers between own accounts left out."""

    period: Literal["week", "month", "quarter"]
    buckets: list[BucketOut]
    received_paise: int
    spent_paise: int
    remaining_paise: int
    # False under 3 days of data: the card shows its empty state.
    enough_data: bool


class HistoryPointOut(BaseModel):
    on: date
    net_worth_paise: int


class NetWorthHistoryOut(BaseModel):
    points: list[HistoryPointOut]
    # The first day with data; None before any account exists.
    history_starts: date | None


# P2: Goal Jars (spec 4.7) -------------------------------------------------------------

JarMethod = Literal["manual", "weekly", "monthly", "payday"]
_JarName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
_Icon = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8)]


class JarFields(_StrictRequest):
    name: _JarName
    icon: _Icon
    target_paise: _Positive
    target_date: _BoundedDate | None = None
    account_id: _Id
    method: JarMethod = "manual"
    # How much each suggested contribution is; required unless the method is manual.
    contribution_paise: _Positive | None = None

    @model_validator(mode="after")
    def _contribution_for_method(self):
        if self.method != "manual" and self.contribution_paise is None:
            raise ValueError("Enter how much to add each time.")
        return self


class JarCreate(JarFields):
    """Create jar, the brief's eight steps in one request."""

    client_key: _ClientKey
    initial_paise: _NonNegative = 0


class JarUpdate(JarFields):
    """Edit goal. A new account moves the jar's money with it."""


class JarMoveRequest(_StrictRequest):
    """Add money or Withdraw: only the allocation moves."""

    client_key: _ClientKey
    amount_paise: _Positive
    occurred_on: _BoundedDate
    note: _Note = None


class ContributionAnswer(_StrictRequest):
    """Approve or skip a suggested automatic contribution."""

    client_key: _ClientKey
    due_on: _BoundedDate
    approve: StrictBool


class JarOut(BaseModel):
    id: str
    name: str
    icon: str
    target_paise: int
    target_date: date | None
    account_id: str
    method: JarMethod
    contribution_paise: int | None
    next_contribution_on: date | None
    status: Literal["active", "paused", "complete", "archived"]
    # What the card shows: active, paused, complete or date_passed.
    state: Literal["active", "paused", "complete", "date_passed"]
    saved_paise: int
    remaining_paise: int
    progress: int
    # Remaining ÷ months left; None without a target date.
    suggested_monthly_paise: int | None
    # "A little behind" (suggestion 17).
    behind: bool
    # A suggested contribution is waiting for approval.
    contribution_due: bool
    # How much more the account's jars hold than the account has; 0 when fine.
    account_short_paise: int
    celebrated: bool
    created_at: datetime


class JarsOut(BaseModel):
    """The carousel: "₹57,000 set aside across 3 jars"."""

    total_saved_paise: int
    count: int
    jars: list[JarOut]


class JarMoveOut(BaseModel):
    id: str
    jar_id: str
    amount_paise: int
    account_id: str
    occurred_on: date
    note: str | None
    auto: bool
    created_at: datetime
    deleted: bool = False


class JarDetailOut(BaseModel):
    jar: JarOut
    # Newest first.
    moves: list[JarMoveOut]


# P3: Groups (spec 5 and 8) ---------------------------------------------------------------

_MemberName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class GroupCreate(_StrictRequest):
    """A group of names; the user is added as "You"."""

    client_key: _ClientKey
    name: _JarName
    icon: _Icon
    members: Annotated[list[_MemberName], Field(min_length=1, max_length=20)]


class GroupUpdate(_StrictRequest):
    name: _JarName
    icon: _Icon
    add_members: Annotated[list[_MemberName], Field(max_length=20)] = []
    # Only someone with nothing in the group yet can be removed.
    remove_members: Annotated[list[_Id], Field(max_length=20)] = []


class GroupExpenseIn(_StrictRequest):
    """Quick Add Group Expense: who paid, who shares it and how."""

    client_key: _ClientKey
    description: _Description
    category: ExpenseCategory = "other"
    amount_paise: _Positive
    paid_by: _Id
    split: Literal["equal", "exact"]
    # Equal: the people sharing it. Exact: member id -> share in paise.
    participants: Annotated[list[_Id], Field(max_length=21)] = []
    shares: dict[str, Annotated[StrictInt, Field(ge=0, le=MAX_PAISE)]] = {}
    occurred_on: _BoundedDate
    note: _Note = None
    # The user's account, needed when the user paid.
    account_id: _Id | None = None


class GroupSettlementIn(_StrictRequest):
    """Settlement in a group: who paid whom, how much and when."""

    client_key: _ClientKey
    from_member: _Id
    to_member: _Id
    amount_paise: _Positive
    occurred_on: _BoundedDate
    note: _Note = None
    # The user's account, needed when the user paid or was paid.
    account_id: _Id | None = None


class GroupMemberOut(BaseModel):
    id: str
    name: str
    is_me: bool
    removed: bool
    # Positive: the group owes them. Negative: they owe.
    balance_paise: int


class GroupOut(BaseModel):
    id: str
    name: str
    icon: str
    archived: bool
    # The user's balance: positive is owed to them, negative they owe.
    my_balance_paise: int
    member_count: int
    created_at: datetime


class GroupsOut(BaseModel):
    """Khata › Groups, and the breakdown's group rows."""

    owed_to_you_paise: int
    you_owe_paise: int
    groups: list[GroupOut]


class GroupExpenseOut(BaseModel):
    id: str
    description: str
    category: str
    amount_paise: int
    paid_by: str
    split: Literal["equal", "exact"]
    shares: dict[str, int]
    my_share_paise: int
    occurred_on: date
    note: str | None
    account_id: str | None
    created_at: datetime


class GroupSettlementOut(BaseModel):
    id: str
    from_member: str
    to_member: str
    amount_paise: int
    occurred_on: date
    note: str | None
    account_id: str | None
    created_at: datetime


class SettleStepOut(BaseModel):
    from_member: str
    to_member: str
    amount_paise: int


class GroupDetailOut(BaseModel):
    group: GroupOut
    members: list[GroupMemberOut]
    # Who pays whom to settle everything, in few payments.
    settle_up: list[SettleStepOut]
    # Newest first.
    expenses: list[GroupExpenseOut]
    settlements: list[GroupSettlementOut]


# P4: Intelligence (spec 3, 4.9, 4.10) -----------------------------------------------------


class NoteBody(BaseModel):
    key: str
    kind: Literal["due_soon", "pending", "category_up", "jar_milestone", "streak"]
    # Numbers only: the app writes the words with its own formatter (hidden amounts stay hidden).
    params: dict
    # "Understand this": the numbers and entries behind the note.
    details: dict


class NoteOut(BaseModel):
    """A note from CUE (4.10). getting_to_know: under a week of logging, no note yet."""

    getting_to_know: bool
    note: NoteBody | None


class DismissNote(_StrictRequest):
    key: Annotated[str, StringConstraints(min_length=1, max_length=120)]


class AskRequest(_StrictRequest):
    query: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]


class AskOut(BaseModel):
    """Ask CUE. Amounts in text and lines are {{₹<paise>}} tokens for the app to format.
    A draft is never saved: the app opens the form for the user to check and save."""

    kind: Literal["answer", "draft", "help"]
    text: str
    lines: list[str]
    draft: dict | None
    suggestions: list[str]


class CategoryFix(_StrictRequest):
    """Long-press to fix a category (suggestion 18); remember applies it to the merchant from now on."""

    category: str
    remember: StrictBool = False


class MerchantCategoryOut(BaseModel):
    merchant: str
    kind: Literal["expense", "income"]
    category: str
