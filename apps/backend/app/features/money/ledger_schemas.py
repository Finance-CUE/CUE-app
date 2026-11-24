"""Request and response contracts for the account ledger (dashboard spec P0).

Same rules as schemas.py: amounts are integer paise, requests are strict (no
coercion, no unknown fields) and dates arrive as ISO strings.
"""

import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StrictInt, StringConstraints, model_validator

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


class EntryCreate(EntryFields):
    client_key: _ClientKey
    type: EntryType

    @model_validator(mode="after")
    def _valid_for_type(self):
        self._check(self.type)
        return self


class EntryUpdate(EntryFields):
    """Edit an entry. Its type stays; the router checks the fields against it."""


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
