"""Builds the client-facing result from a stored or freshly computed score."""

from app.features.assessment.archetypes import ARCHETYPES_BY_SLUG
from app.features.assessment.schemas import ArchetypeCard, ResultResponse
from app.features.assessment.scoring import AssessmentScore, band


def _card(slug: str) -> ArchetypeCard:
    archetype = ARCHETYPES_BY_SLUG[slug]
    return ArchetypeCard(
        slug=archetype.slug,
        name=archetype.name,
        description=archetype.description,
        strengths=list(archetype.strengths),
        blind_spots=list(archetype.blind_spots),
    )


def to_response(score: AssessmentScore) -> ResultResponse:
    return ResultResponse(
        dimensions={dimension: round(value, 2) for dimension, value in score.dimensions.items()},
        bands={dimension: band(value) for dimension, value in score.dimensions.items()},
        primary=_card(score.primary),
        secondary=_card(score.secondary),
        tertiary=_card(score.tertiary),
        scoring_version=score.version,
        computed_at=score.computed_at,
    )
