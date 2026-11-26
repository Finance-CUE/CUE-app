from fastapi import APIRouter

from app.features.assessment.router import router as assessment_router
from app.features.auth.router import router as auth_router
from app.features.money.flows_router import router as flows_router
from app.features.money.ledger_router import router as ledger_router
from app.features.money.router import profile_router, router as money_router
from app.features.money.schedule_router import router as schedule_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(assessment_router)
api_router.include_router(money_router)
api_router.include_router(ledger_router)
api_router.include_router(schedule_router)
api_router.include_router(flows_router)
api_router.include_router(profile_router)
