import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jwt import PyJWKClient
from slowapi.errors import RateLimitExceeded

from app.api.router import api_router
from app.core.config import get_settings
from app.features.assessment.repository import AssessmentRepository, AssessmentStoreError
from app.features.auth.router import limiter
from app.features.money.repository import MoneyRepository, MoneyStoreError
from app.features.auth.profiles import ProfileStore
from app.features.auth.service import AuthError, SupabaseAuthClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """One HTTP client and one JWKS cache for the process lifetime."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
        app.state.auth_client = SupabaseAuthClient(settings, client)
        app.state.profile_store = ProfileStore(settings, client)
        app.state.jwk_client = PyJWKClient(settings.supabase_jwks_url, cache_keys=True)
        app.state.assessment_repo = AssessmentRepository(settings, client)
        app.state.money_repo = MoneyRepository(settings, client)
        yield


app = FastAPI(
    title="CUE API",
    version="0.1.0",
    lifespan=lifespan,
    # Schema browsing is a reconnaissance aid; keep it off in production.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/openapi.json",
)

app.state.limiter = limiter

# Native apps send no Origin header, so this only affects Expo web. Explicit
# origins, never "*" - a wildcard plus credentials is what browsers refuse anyway.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


def _error(status_code: int, message: str, code: str) -> JSONResponse:
    """Every error the app sees: a sentence to show the user, and a stable code to branch on."""
    return JSONResponse(status_code=status_code, content={"detail": message, "code": code})


# Store failures are logged with detail where they happen; the user only needs
# to know it was our side and that retrying is reasonable.
MSG_SERVER_TROUBLE = "Something went wrong on our side. Please try again in a moment."


@app.exception_handler(AuthError)
async def _auth_error(request: Request, exc: AuthError) -> JSONResponse:
    return _error(exc.status_code, str(exc), exc.code)


@app.exception_handler(AssessmentStoreError)
async def _assessment_store_failure(request: Request, exc: AssessmentStoreError) -> JSONResponse:
    return _error(status.HTTP_503_SERVICE_UNAVAILABLE, MSG_SERVER_TROUBLE, "server_unavailable")


@app.exception_handler(MoneyStoreError)
async def _money_store_failure(request: Request, exc: MoneyStoreError) -> JSONResponse:
    return _error(status.HTTP_503_SERVICE_UNAVAILABLE, MSG_SERVER_TROUBLE, "server_unavailable")


@app.exception_handler(RateLimitExceeded)
async def _rate_limited(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return _error(
        status.HTTP_429_TOO_MANY_REQUESTS,
        "Too many attempts. Please wait a few minutes and try again.",
        "rate_limited",
    )


_FIELD_HINTS = {
    "email": "Please enter a valid email address.",
    "code": "Enter the code from your email, using digits only.",
    "full_name": "Please enter your full name (2 to 80 characters).",
    "id_token": "Google sign-in didn't work. Please try again.",
}


def _validation_message(exc: RequestValidationError) -> str:
    """First problem as one sentence. Our own validators already speak plain English."""
    for error in exc.errors():
        message = str(error.get("msg", ""))
        if message.startswith("Value error, "):
            return message.removeprefix("Value error, ")
        field = str(error.get("loc", ("",))[-1])
        if field in _FIELD_HINTS:
            return _FIELD_HINTS[field]
    return "Some details are missing or invalid. Please check and try again."


@app.exception_handler(RequestValidationError)
async def _invalid_request(request: Request, exc: RequestValidationError) -> JSONResponse:
    return _error(
        status.HTTP_422_UNPROCESSABLE_CONTENT, _validation_message(exc), "invalid_request"
    )


@app.exception_handler(StarletteHTTPException)
async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    codes = {401: "session_expired", 404: "not_found", 409: "conflict", 422: "invalid_request"}
    response = _error(exc.status_code, str(exc.detail), codes.get(exc.status_code, "error"))
    if exc.headers:
        response.headers.update(exc.headers)
    return response


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
    # Tracebacks can carry credentials and payloads. Log server-side, return a
    # fixed string to the client.
    logging.getLogger(__name__).exception("unhandled error on %s", request.url.path)
    return _error(status.HTTP_500_INTERNAL_SERVER_ERROR, MSG_SERVER_TROUBLE, "server_error")


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_router)
