"""Scoring engine checks. Pure functions, no network.

Run: cd apps/backend && python -m pytest tests/test_assessment_scoring.py -v
"""

import pytest

from app.features.assessment.archetypes import ARCHETYPES, ARCHETYPES_BY_SLUG, DIMENSIONS
from app.features.assessment.scoring import (
    QUESTION_DIMENSIONS,
    IncompleteAnswersError,
    band,
    dimension_scores,
    normalise,
    rank_archetypes,
    score_assessment,
)


def _answers(value: int = 3, **overrides: int) -> dict[int, int]:
    answers = {question_id: value for question_id in range(1, 19)}
    answers.update({int(key.removeprefix("q")): v for key, v in overrides.items()})
    return answers


# -- normalise -------------------------------------------------------------


@pytest.mark.parametrize(
    ("response", "reverse", "expected"),
    [
        (1, False, 0),
        (2, False, 25),
        (3, False, 50),
        (4, False, 75),
        (5, False, 100),
        (1, True, 100),
        (2, True, 75),
        (3, True, 50),
        (4, True, 25),
        (5, True, 0),
    ],
)
def test_normalise_matches_the_documented_table(response, reverse, expected):
    assert normalise(response, reverse) == expected


@pytest.mark.parametrize("bad", [0, 6, -1])
def test_normalise_rejects_out_of_range(bad):
    with pytest.raises(ValueError):
        normalise(bad, False)


# -- dimensions ------------------------------------------------------------


def test_documented_future_orientation_example():
    # Q7=5 reversed -> 0, Q8=4 -> 75, Q9=5 reversed -> 0; mean = 25.
    scores = dimension_scores(_answers(q7=5, q8=4, q9=5))
    assert scores["future_orientation"] == 25


def test_only_q7_and_q9_are_reversed():
    reversed_ids = {qid for qid, (_, rev) in QUESTION_DIMENSIONS.items() if rev}
    assert reversed_ids == {7, 9}


def test_each_dimension_has_exactly_three_questions():
    for dimension in DIMENSIONS:
        assert sum(1 for d, _ in QUESTION_DIMENSIONS.values() if d == dimension) == 3


@pytest.mark.parametrize("missing", [1, 7, 18])
def test_incomplete_answers_are_rejected(missing):
    answers = _answers()
    del answers[missing]
    with pytest.raises(IncompleteAnswersError):
        dimension_scores(answers)


def test_unknown_question_ids_are_rejected():
    with pytest.raises(IncompleteAnswersError):
        dimension_scores({**_answers(), 19: 3})


# -- bands -----------------------------------------------------------------


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (0, "very_low"),
        (20, "very_low"),
        (20.4, "very_low"),
        (20.5, "low"),
        (40, "low"),
        (40.5, "moderate"),
        (60, "moderate"),
        (60.5, "high"),
        (80, "high"),
        (80.5, "very_high"),
        (100, "very_high"),
    ],
)
def test_band_edges(score, expected):
    assert band(score) == expected


# -- archetype matching ----------------------------------------------------


def test_there_are_ten_archetypes_with_unique_slugs():
    assert len(ARCHETYPES) == 10
    assert len(ARCHETYPES_BY_SLUG) == 10


def test_every_archetype_midpoint_ranks_itself_first():
    for archetype in ARCHETYPES:
        dimensions = dict(zip(DIMENSIONS, archetype.vector, strict=True))
        ranking = rank_archetypes(dimensions)
        assert ranking[0][0] == archetype.slug, archetype.slug
        assert ranking[0][1] == pytest.approx(1.0)


def test_dreamer_midpoint_vector():
    assert ARCHETYPES_BY_SLUG["dreamer"].vector == (50, 92.5, 90, 50, 35, 60)


def test_ranking_covers_all_archetypes_in_descending_order():
    ranking = rank_archetypes(dict(zip(DIMENSIONS, (60, 40, 70, 30, 55, 45), strict=True)))
    assert len(ranking) == 10
    similarities = [similarity for _, similarity in ranking]
    assert similarities == sorted(similarities, reverse=True)


def test_zero_vector_does_not_crash_and_ties_keep_archetype_order():
    ranking = rank_archetypes({dimension: 0.0 for dimension in DIMENSIONS})
    assert [slug for slug, _ in ranking] == [a.slug for a in ARCHETYPES]
    assert all(similarity == 0.0 for _, similarity in ranking)


@pytest.mark.parametrize("value", [1, 3, 5])
def test_straight_lined_answers_still_produce_a_full_ranking(value):
    score = score_assessment(_answers(value))
    assert len(score.ranking) == 10
    assert len({score.primary, score.secondary, score.tertiary}) == 3


def test_score_assessment_exposes_primary_secondary_tertiary():
    score = score_assessment(_answers(q7=1, q9=1, q10=5, q11=5, q12=5))
    assert (score.primary, score.secondary, score.tertiary) == tuple(
        slug for slug, _ in score.ranking[:3]
    )
    assert score.version == "1.0"
