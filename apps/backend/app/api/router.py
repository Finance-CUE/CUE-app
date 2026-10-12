from fastapi import APIRouter

from app.features.assessment.router import router as assessment_router
from app.features.auth.router import router as auth_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(assessment_router)
