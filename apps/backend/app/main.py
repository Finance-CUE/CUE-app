import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jwt import PyJWKClient
from slowapi.errors import RateLimitExceeded

from app.api.router import api_router
from app.core.config import get_settings
from app.features.auth.router import limiter
from app.features.auth.service import (
    AccountExistsError,
    InvalidCredentialsError,
    SupabaseAuthClient,
    UpstreamAuthError,
    UpstreamRateLimitError,
    WeakPasswordError,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """One HTTP client and one JWKS cache for the process lifetime."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
        app.state.auth_client = SupabaseAuthClient(settings, client)
        app.state.jwk_client = PyJWKClient(settings.supabase_jwks_url, cache_keys=True)
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
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


def _error(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"detail": message})


@app.exception_handler(InvalidCredentialsError)
async def _invalid_credentials(request: Request, exc: InvalidCredentialsError) -> JSONResponse:
    return _error(status.HTTP_401_UNAUTHORIZED, str(exc))


@app.exception_handler(AccountExistsError)
async def _account_exists(request: Request, exc: AccountExistsError) -> JSONResponse:
    return _error(status.HTTP_409_CONFLICT, str(exc))


@app.exception_handler(WeakPasswordError)
async def _weak_password(request: Request, exc: WeakPasswordError) -> JSONResponse:
    return _error(status.HTTP_400_BAD_REQUEST, str(exc))


@app.exception_handler(UpstreamRateLimitError)
async def _upstream_rate_limited(request: Request, exc: UpstreamRateLimitError) -> JSONResponse:
    return _error(status.HTTP_429_TOO_MANY_REQUESTS, str(exc))


@app.exception_handler(UpstreamAuthError)
async def _upstream_failure(request: Request, exc: UpstreamAuthError) -> JSONResponse:
    return _error(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))


@app.exception_handler(RateLimitExceeded)
async def _rate_limited(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return _error(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Please try again later.")


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
    # Tracebacks can carry credentials and payloads. Log server-side, return a
    # fixed string to the client.
    logging.getLogger(__name__).exception("unhandled error on %s", request.url.path)
    return _error(status.HTTP_500_INTERNAL_SERVER_ERROR, "Something went wrong.")


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_router)
