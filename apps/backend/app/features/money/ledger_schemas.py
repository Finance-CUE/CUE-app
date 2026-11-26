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
