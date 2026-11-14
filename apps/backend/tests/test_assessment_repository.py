"""Repository checks against a mocked PostgREST. No network.

Run: cd apps/backend && python -m pytest tests/test_assessment_repository.py -v
"""

import asyncio
import json
from dataclasses import replace
from datetime import UTC, datetime

import httpx
import pytest

from app.core.config import get_settings
from app.features.assessment.archetypes import DIMENSIONS
from app.features.assessment.repository import AssessmentRepository, AssessmentStoreError
from app.features.assessment.scoring import score_assessment

USER = "11111111-1111-4111-8111-111111111111"


def _run(handler, action):
    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await action(AssessmentRepository(get_settings(), client))

    return asyncio.run(go())


def test_save_answer_upserts_on_the_composite_key():
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(201)

    _run(handler, lambda repo: repo.save_answer(USER, 7, 4))

    request = seen[0]
    assert request.method == "POST"
    assert request.url.path == "/rest/v1/assessment_responses"
    assert request.url.params["on_conflict"] == "user_id,question_id"
    assert "resolution=merge-duplicates" in request.headers["prefer"]
    assert request.headers["apikey"] == get_settings().supabase_secret_key
    body = json.loads(request.content)
    assert (body["user_id"], body["question_id"], body["response"]) == (USER, 7, 4)


def test_get_answers_filters_by_user_and_returns_a_dict():
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(
            200, json=[{"question_id": 2, "response": 5}, {"question_id": 1, "response": 3}]
        )

    answers = _run(handler, lambda repo: repo.get_answers(USER))

    assert answers == {1: 3, 2: 5}
    assert seen[0].url.params["user_id"] == f"eq.{USER}"


def test_upstream_error_becomes_a_generic_store_error():
    def handler(request):
        return httpx.Response(500, json={"message": "secret database detail"})

    with pytest.raises(AssessmentStoreError) as exc_info:
        _run(handler, lambda repo: repo.get_answers(USER))

    assert "secret" not in str(exc_info.value)


def test_transport_failure_becomes_a_store_error():
    def handler(request):
        raise httpx.ConnectError("boom")

    with pytest.raises(AssessmentStoreError):
        _run(handler, lambda repo: repo.save_answer(USER, 1, 3))


def test_non_uuid_user_id_never_reaches_the_network():
    def handler(request):
        raise AssertionError("no request should be sent")

    with pytest.raises(ValueError):
        _run(handler, lambda repo: repo.get_answers("1;drop table users"))


def test_save_result_writes_the_result_then_the_profile():
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(201)

    score = replace(
        score_assessment({question_id: 3 for question_id in range(1, 19)}),
        computed_at=datetime(2026, 10, 24, 8, tzinfo=UTC),
    )
    _run(handler, lambda repo: repo.save_result(USER, score, "peace"))

    result_request, profile_request = seen
    assert result_request.method == "POST"
    assert result_request.url.path == "/rest/v1/assessment_results"
    row = json.loads(result_request.content)
    assert row["user_id"] == USER
    assert row["primary_archetype"] == score.primary
    assert row["secondary_archetype"] == score.secondary
    assert row["tertiary_archetype"] == score.tertiary
    assert row["scoring_version"] == score.version
    assert set(DIMENSIONS) <= set(row)
    assert row["computed_at"] == score.computed_at.isoformat()
    assert set(row["similarities"]) == {slug for slug, _ in score.ranking}

    assert profile_request.method == "PATCH"
    assert profile_request.url.path == "/rest/v1/users"
    assert profile_request.url.params["id"] == f"eq.{USER}"
    profile = json.loads(profile_request.content)
    assert profile["archetype"] == score.primary
    assert profile["has_completed_assessment"] is True
    assert profile["money_why"] == "peace"


def test_get_latest_result_rebuilds_the_score_and_returns_none_when_empty():
    score = score_assessment({question_id: 4 for question_id in range(1, 19)})
    row = {
        **{dimension: score.dimensions[dimension] for dimension in DIMENSIONS},
        "primary_archetype": score.primary,
        "secondary_archetype": score.secondary,
        "tertiary_archetype": score.tertiary,
        "similarities": {slug: similarity for slug, similarity in score.ranking},
        "scoring_version": score.version,
    }
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=[row])

    rebuilt = _run(handler, lambda repo: repo.get_latest_result(USER))

    assert rebuilt is not None
    assert (rebuilt.primary, rebuilt.secondary, rebuilt.tertiary) == (
        score.primary,
        score.secondary,
        score.tertiary,
    )
    assert rebuilt.dimensions == pytest.approx(score.dimensions)
    assert seen[0].url.params["order"] == "computed_at.desc"
    assert seen[0].url.params["limit"] == "1"

    assert _run(lambda request: httpx.Response(200, json=[]), lambda r: r.get_latest_result(USER)) is None


def test_latest_result_includes_computed_at():
    from datetime import datetime

    score = score_assessment({question_id: 4 for question_id in range(1, 19)})
    row = {
        **{dimension: score.dimensions[dimension] for dimension in DIMENSIONS},
        "primary_archetype": score.primary,
        "secondary_archetype": score.secondary,
        "tertiary_archetype": score.tertiary,
        "similarities": {slug: similarity for slug, similarity in score.ranking},
        "scoring_version": score.version,
        "computed_at": "2026-10-12T10:00:00+00:00",
    }
    seen: list[httpx.Request] = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=[row])

    rebuilt = _run(handler, lambda repo: repo.get_latest_result(USER))

    assert rebuilt.computed_at == datetime.fromisoformat("2026-10-12T10:00:00+00:00")
    assert "computed_at" in seen[0].url.params["select"].split(",")
