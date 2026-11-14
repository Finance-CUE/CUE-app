"""Request and response contracts for the money API.

Amounts are integer paise. Request models are strict: no type coercion
(21000.0 and "21000" are rejected for an amount) and no unknown fields. Dates
are the exception: they arrive as ISO strings and are parsed.
"""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    StringConstraints,
    field_validator,
    model_validator,
)

Category = Literal["food", "groceries", "transport", "shopping", "bills", "fun", "other", "subscription"]
Direction = Literal["lent", "borrowed"]

MAX_PAISE = 10_000_000_000  # Rs 10,00,00,000

# Stripped first, then length-checked.
_Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
_Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
_Note = Annotated[
    str | None,
    StringConstraints(strip_whitespace=True, max_length=120),
    AfterValidator(lambda v: v or None),
]
_Positive = Annotated[StrictInt, Field(ge=1, le=MAX_PAISE)]
_NonNegative = Annotated[StrictInt, Field(ge=0, le=MAX_PAISE)]
# Strict mode would refuse "2026-10-24"; dates alone opt back into parsing.
_IsoDate = Annotated[date, Field(strict=False)]
# Client-supplied dates are bounded so date maths cannot overflow.
MIN_DATE = date(2000, 1, 1)
MAX_DATE = date(2100, 12, 31)
_BoundedDate = Annotated[date, Field(strict=False, ge=MIN_DATE, le=MAX_DATE)]


class _StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class SpendCreate(_StrictRequest):
    description: _Description
    amount_paise: _Positive
    category: Category
    spent_on: _BoundedDate
    billing_day: Annotated[StrictInt, Field(ge=1, le=31)] | None = None

    @model_validator(mode="after")
    def _billing_day_only_for_subscriptions(self):
        if self.category == "subscription" and len(self.description) > 60:
            raise ValueError("Subscription names are at most 60 characters.")
        if (self.category == "subscription") != (self.billing_day is not None):
            raise ValueError("billing_day is required for subscriptions and forbidden otherwise.")
        return self


class SpendUpdate(_StrictRequest):
    """Edit a logged spend. Subscription payments are edited through their subscription."""

    description: _Description
    amount_paise: _Positive
    category: Literal["food", "groceries", "transport", "shopping", "bills", "fun", "other"]
    spent_on: _BoundedDate


class StartingMoneyPut(_StrictRequest):
    bank_paise: _NonNegative
    cash_paise: _NonNegative


class KhataCreate(_StrictRequest):
    direction: Direction
    person: _Name
    amount_paise: _Positive
    note: _Note = None


class SubscriptionCreate(_StrictRequest):
    name: _Name
    amount_paise: _Positive
    billing_day: Annotated[StrictInt, Field(ge=1, le=31)]
    starts_on: _BoundedDate


class CycleAnswer(_StrictRequest):
    month: _BoundedDate
    active: StrictBool

    @field_validator("month")
    @classmethod
    def _first_of_month(cls, v: date) -> date:
        if v.day != 1:
            raise ValueError("month must be the first day of a month.")
        return v


class NudgesPut(_StrictRequest):
    pre_spend: StrictBool
    patterns: StrictBool
    weekly: StrictBool


class Spend(BaseModel):
    id: str
    description: str
    amount_paise: int
    category: Category
    spent_on: date
    created_at: datetime


class KhataEntry(BaseModel):
    id: str
    direction: Direction
    person: str
    amount_paise: int
    note: str | None
    created_at: datetime


class Subscription(BaseModel):
    id: str
    name: str
    amount_paise: int
    billing_day: int
    starts_on: date
    active: bool
    created_at: datetime
    next_billing_on: date | None = None


class DueCycle(BaseModel):
    subscription_id: str
    name: str
    amount_paise: int
    month: date
    billing_on: date


class TrendPoint(BaseModel):
    date: date
    balance_paise: int | None
    spent_paise: int


class BalanceSnapshot(BaseModel):
    bank_paise: int
    cash_paise: int
    recorded_at: datetime


class NudgeTemplate(BaseModel):
    archetype: str
    kind: Literal["pattern", "pre_spend", "spike", "weekly"]
    title: str
    body: str


class StartingMoney(BaseModel):
    bank_paise: int
    cash_paise: int
    set_at: datetime


class MoneySummary(BaseModel):
    net_worth_paise: int | None
    starting_money: StartingMoney | None
    # Spends logged after the balance was last set; already taken off net_worth_paise.
    spent_since_update_paise: int = 0
    owed_to_you_paise: int
    you_owe_paise: int


class Nudges(BaseModel):
    pre_spend: bool
    patterns: bool
    weekly: bool


class PlannedNudge(BaseModel):
    id: str
    kind: Literal["pattern", "pre_spend", "spike", "weekly", "subscription"]
    title: str
    body: str
    fire_at: datetime
