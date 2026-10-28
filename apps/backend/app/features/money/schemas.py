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
)

Category = Literal["food", "groceries", "transport", "shopping", "bills", "fun", "other"]
Direction = Literal["lent", "borrowed"]
Cadence = Literal["monthly", "yearly"]

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
# Client-supplied due dates are bounded so date maths cannot overflow.
MIN_DATE = date(2000, 1, 1)
MAX_DATE = date(2100, 12, 31)
_BoundedDate = Annotated[date, Field(strict=False, ge=MIN_DATE, le=MAX_DATE)]


class _StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class SpendCreate(_StrictRequest):
    description: _Description
    amount_paise: _Positive
    category: Category
    spent_on: _IsoDate


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
    cadence: Cadence
    next_due_on: _BoundedDate


class AssetCreate(_StrictRequest):
    name: _Name
    value_paise: _Positive


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
    cadence: Cadence
    next_due_on: date
    created_at: datetime


class Asset(BaseModel):
    id: str
    name: str
    value_paise: int
    created_at: datetime


class StartingMoney(BaseModel):
    bank_paise: int
    cash_paise: int
    set_at: datetime


class MoneySummary(BaseModel):
    net_worth_paise: int | None
    starting_money: StartingMoney | None
    owed_to_you_paise: int
    you_owe_paise: int


class Nudges(BaseModel):
    pre_spend: bool
    patterns: bool
    weekly: bool


class PlannedNudge(BaseModel):
    id: str
    kind: Literal["pattern", "pre_spend"]
    title: str
    body: str
    fire_at: datetime
