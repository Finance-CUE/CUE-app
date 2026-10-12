"""Request and response contracts for the assessment API.

Request models are strict: no type coercion ("3" and 3.5 are rejected for an
integer response) and no unknown fields.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt

MoneyWhy = Literal[
    "peace",
    "freedom",
    "stability",
    "status",
    "comfort",
    "excitement",
    "belonging",
    "control",
    "possibility",
    "security",
]


class _StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class AnswerRequest(_StrictRequest):
    response: StrictInt = Field(ge=1, le=5)


class CompleteRequest(_StrictRequest):
    money_why: MoneyWhy


class AnswerItem(BaseModel):
    question_id: int
    response: int


class ProgressResponse(BaseModel):
    answers: list[AnswerItem]


class ArchetypeCard(BaseModel):
    slug: str
    name: str
    description: str
    strengths: list[str]
    blind_spots: list[str]


class ResultResponse(BaseModel):
    """Raw cosine similarities are deliberately absent: only rank is meaningful."""

    dimensions: dict[str, float]
    bands: dict[str, str]
    primary: ArchetypeCard
    secondary: ArchetypeCard
    tertiary: ArchetypeCard
    scoring_version: str
