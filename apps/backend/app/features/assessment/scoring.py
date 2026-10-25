"""Scoring engine. Pure functions: no I/O, no framework imports.

Pipeline: 5-point Likert -> reverse where required -> normalise to 0-100 ->
mean per dimension -> bands -> cosine match against archetype fingerprints.
Q19 (Money Why) never enters this module.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from math import floor, sqrt

from app.features.assessment.archetypes import ARCHETYPES, DIMENSIONS

SCORING_VERSION = "1.0"

# question id -> (dimension, reverse-scored). Q7 and Q9 are phrased negatively
# ("I haven't started yet", "figure it out as I go"), so agreeing lowers the score.
QUESTION_DIMENSIONS: dict[int, tuple[str, bool]] = {
    1: ("family_influence", False),
    2: ("family_influence", False),
    3: ("family_influence", False),
    4: ("identity", False),
    5: ("identity", False),
    6: ("identity", False),
    7: ("future_orientation", True),
    8: ("future_orientation", False),
    9: ("future_orientation", True),
    10: ("financial_agency", False),
    11: ("financial_agency", False),
    12: ("financial_agency", False),
    13: ("present_bias", False),
    14: ("present_bias", False),
    15: ("present_bias", False),
    16: ("financial_avoidance", False),
    17: ("financial_avoidance", False),
    18: ("financial_avoidance", False),
}
QUESTION_COUNT = len(QUESTION_DIMENSIONS)

_BANDS = ((20, "very_low"), (40, "low"), (60, "moderate"), (80, "high"))


class IncompleteAnswersError(ValueError):
    """Answers do not cover exactly questions 1-18."""


def normalise(response: int, reverse: bool) -> float:
    if not 1 <= response <= 5:
        raise ValueError("response must be between 1 and 5")
    value = 6 - response if reverse else response
    return (value - 1) / 4 * 100


def dimension_scores(responses: Mapping[int, int]) -> dict[str, float]:
    if set(responses) != set(QUESTION_DIMENSIONS):
        raise IncompleteAnswersError("Expected answers for questions 1-18.")

    grouped: dict[str, list[float]] = {dimension: [] for dimension in DIMENSIONS}
    for question_id, (dimension, reverse) in QUESTION_DIMENSIONS.items():
        grouped[dimension].append(normalise(responses[question_id], reverse))

    return {dimension: sum(values) / len(values) for dimension, values in grouped.items()}


def band(score: float) -> str:
    # Half-up rounding so 20.5 is Low, matching the documented 0-20 / 21-40 edges.
    rounded = floor(score + 0.5)
    for upper, name in _BANDS:
        if rounded <= upper:
            return name
    return "very_high"


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    norm = sqrt(sum(x * x for x in a)) * sqrt(sum(y * y for y in b))
    if norm == 0:
        return 0.0
    return sum(x * y for x, y in zip(a, b, strict=True)) / norm


def rank_archetypes(dimensions: Mapping[str, float]) -> tuple[tuple[str, float], ...]:
    """All ten archetypes, most similar first. Ties keep ARCHETYPES order (stable sort)."""
    vector = [dimensions[dimension] for dimension in DIMENSIONS]
    scored = [(archetype.slug, cosine(vector, archetype.vector)) for archetype in ARCHETYPES]
    return tuple(sorted(scored, key=lambda item: -item[1]))


@dataclass(frozen=True)
class AssessmentScore:
    dimensions: dict[str, float]
    ranking: tuple[tuple[str, float], ...]
    version: str = SCORING_VERSION
    computed_at: datetime | None = None

    @property
    def primary(self) -> str:
        return self.ranking[0][0]

    @property
    def secondary(self) -> str:
        return self.ranking[1][0]

    @property
    def tertiary(self) -> str:
        return self.ranking[2][0]


def score_assessment(responses: Mapping[int, int]) -> AssessmentScore:
    dimensions = dimension_scores(responses)
    return AssessmentScore(dimensions=dimensions, ranking=rank_archetypes(dimensions))
