"""Persistence for the assessment, over Supabase PostgREST.

The backend has no database driver; like the auth client it speaks HTTP through
the shared httpx client. The secret key bypasses RLS, so every query here filters
by a user id that has already been parsed as a UUID.

Never log request bodies: they hold the user's answers.

ponytail: saving a result is two requests (insert result, patch profile), not a
transaction. A failure between them leaves a result without a profile update; the
client retries `complete`, which inserts another history row and patches again.
Move to a single Postgres function (rpc) if stricter atomicity is ever needed.
"""

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx

from app.core.config import Settings
from app.features.assessment.archetypes import DIMENSIONS
from app.features.assessment.scoring import AssessmentScore

logger = logging.getLogger(__name__)

_RANK_COLUMNS = ("primary_archetype", "secondary_archetype", "tertiary_archetype")


class AssessmentStoreError(Exception):
    """The assessment store was unreachable or rejected a request."""


def _uid(user_id: str) -> str:
    # Raises ValueError for anything that is not a UUID, before any request is built.
    return str(uuid.UUID(user_id))


class AssessmentRepository:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._client = client
        self._base = f"{settings.supabase_url}/rest/v1"
        self._key = settings.supabase_secret_key

    def _headers(self, prefer: str | None = None) -> dict[str, str]:
        headers = {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        return headers

    async def _request(
        self,
        method: str,
        table: str,
        *,
        params: dict[str, str] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> httpx.Response:
        try:
            response = await self._client.request(
                method,
                f"{self._base}/{table}",
                headers=self._headers(prefer),
                params=params,
                json=json,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            # Class of failure only; the body can echo the user's data.
            logger.error("assessment store %s %s failed: %s", method, table, type(exc).__name__)
            raise AssessmentStoreError("Assessment service unavailable.") from exc
        return response

    async def save_answer(self, user_id: str, question_id: int, response: int) -> None:
        await self._request(
            "POST",
            "assessment_responses",
            params={"on_conflict": "user_id,question_id"},
            json={
                "user_id": _uid(user_id),
                "question_id": question_id,
                "response": response,
                "answered_at": datetime.now(UTC).isoformat(),
            },
            prefer="resolution=merge-duplicates,return=minimal",
        )

    async def get_answers(self, user_id: str) -> dict[int, int]:
        response = await self._request(
            "GET",
            "assessment_responses",
            params={
                "user_id": f"eq.{_uid(user_id)}",
                "select": "question_id,response",
                "order": "question_id.asc",
            },
        )
        return {row["question_id"]: row["response"] for row in response.json()}

    async def save_result(self, user_id: str, score: AssessmentScore, money_why: str) -> None:
        uid = _uid(user_id)
        row: dict[str, Any] = {
            "user_id": uid,
            **{dimension: round(score.dimensions[dimension], 2) for dimension in DIMENSIONS},
            "primary_archetype": score.primary,
            "secondary_archetype": score.secondary,
            "tertiary_archetype": score.tertiary,
            "similarities": {slug: round(value, 6) for slug, value in score.ranking},
            "scoring_version": score.version,
        }
        if score.computed_at is not None:
            row["computed_at"] = score.computed_at.isoformat()
        await self._request("POST", "assessment_results", json=row, prefer="return=minimal")
        await self._request(
            "PATCH",
            "users",
            params={"id": f"eq.{uid}"},
            json={
                "archetype": score.primary,
                "has_completed_assessment": True,
                "money_why": money_why,
                "updated_at": datetime.now(UTC).isoformat(),
            },
            prefer="return=minimal",
        )

    async def get_latest_result(self, user_id: str) -> AssessmentScore | None:
        response = await self._request(
            "GET",
            "assessment_results",
            params={
                "user_id": f"eq.{_uid(user_id)}",
                "select": ",".join(
                    (*DIMENSIONS, *_RANK_COLUMNS, "similarities", "scoring_version", "computed_at")
                ),
                "order": "computed_at.desc",
                "limit": "1",
            },
        )
        rows = response.json()
        if not rows:
            return None

        row = rows[0]
        similarities = row["similarities"]
        ranking = tuple(
            (row[column], float(similarities.get(row[column], 0.0))) for column in _RANK_COLUMNS
        )
        return AssessmentScore(
            dimensions={dimension: float(row[dimension]) for dimension in DIMENSIONS},
            ranking=ranking,
            version=row["scoring_version"],
            computed_at=(
                datetime.fromisoformat(row["computed_at"]) if row.get("computed_at") else None
            ),
        )
