"""Assessment endpoints.

The user is always the verified token subject. Rate limits share the auth
router's limiter (per client IP, in process memory).
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Request, Response, status

from app.api.dependencies.auth import CurrentClaims
from app.features.assessment.repository import AssessmentRepository
from app.features.assessment.schemas import (
    AnswerItem,
    AnswerRequest,
    CompleteRequest,
    ProgressResponse,
    ResultResponse,
)
from app.features.assessment.scoring import QUESTION_COUNT, IncompleteAnswersError, score_assessment
from app.features.assessment.service import to_response
from app.features.auth.router import limiter

router = APIRouter(prefix="/assessment", tags=["assessment"])


def get_assessment_repo(request: Request) -> AssessmentRepository:
    return request.app.state.assessment_repo


def current_user_id(claims: CurrentClaims) -> str:
    """The token subject as a canonical UUID string, or a 401 like any bad token."""
    try:
        return str(uuid.UUID(str(claims["sub"])))
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


UserId = Annotated[str, Depends(current_user_id)]
Repo = Annotated[AssessmentRepository, Depends(get_assessment_repo)]


@router.put("/answers/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("120/minute")
async def save_answer(
    request: Request,
    question_id: Annotated[int, Path(ge=1, le=QUESTION_COUNT)],
    payload: AnswerRequest,
    user_id: UserId,
    repo: Repo,
) -> Response:
    await repo.save_answer(user_id, question_id, payload.response)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/progress")
@limiter.limit("60/minute")
async def progress(request: Request, user_id: UserId, repo: Repo) -> ProgressResponse:
    answers = await repo.get_answers(user_id)
    return ProgressResponse(
        answers=[AnswerItem(question_id=q, response=answers[q]) for q in sorted(answers)]
    )


@router.post("/complete")
@limiter.limit("10/hour")
async def complete(
    request: Request,
    payload: CompleteRequest,
    user_id: UserId,
    repo: Repo,
) -> ResultResponse:
    try:
        score = score_assessment(await repo.get_answers(user_id))
    except IncompleteAnswersError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Answer all questions before finishing.",
        ) from exc

    await repo.save_result(user_id, score, payload.money_why)
    return to_response(score)


@router.get("/result")
@limiter.limit("60/minute")
async def result(request: Request, user_id: UserId, repo: Repo) -> ResultResponse:
    score = await repo.get_latest_result(user_id)
    if score is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No assessment result yet.")
    return to_response(score)
