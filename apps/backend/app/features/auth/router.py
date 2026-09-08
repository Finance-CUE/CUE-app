"""Auth endpoints.

Rate limits are per client IP. That bounds credential stuffing from a single
source; Supabase applies its own per-account limits on top.

ponytail: slowapi keeps counters in process memory, so limits are per worker.
Move to the Redis backend when the API runs more than one worker.
"""

from fastapi import APIRouter, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.api.dependencies.auth import AuthClient, CurrentClaims
from app.features.auth.schemas import (
    LoginRequest,
    RefreshRequest,
    SessionResponse,
    SignupRequest,
    UserResponse,
)

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/hour")
async def signup(
    request: Request,
    payload: SignupRequest,
    auth: AuthClient,
) -> SessionResponse:
    """Create an account, then sign in with the same credentials.

    Signing in as a second step rather than having the create call hand back a
    session means there is exactly one code path that issues tokens.
    """
    await auth.sign_up(
        email=payload.email,
        phone=payload.phone,
        password=payload.password,
        full_name=payload.full_name,
    )
    return await auth.sign_in(email=payload.email, password=payload.password)


@router.post("/login")
@limiter.limit("10/minute")
async def login(
    request: Request,
    payload: LoginRequest,
    auth: AuthClient,
) -> SessionResponse:
    return await auth.sign_in(email=payload.email, password=payload.password)


@router.post("/refresh")
@limiter.limit("30/minute")
async def refresh(
    request: Request,
    payload: RefreshRequest,
    auth: AuthClient,
) -> SessionResponse:
    return await auth.refresh(refresh_token=payload.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    auth: AuthClient,
    claims: CurrentClaims,
) -> None:
    authorization = request.headers.get("Authorization", "")
    _, _, token = authorization.partition(" ")
    await auth.sign_out(access_token=token)


@router.get("/me")
async def me(claims: CurrentClaims) -> UserResponse:
    metadata = claims.get("user_metadata") or {}
    app_metadata = claims.get("app_metadata") or {}

    return UserResponse(
        id=str(claims.get("sub", "")),
        full_name=str(metadata.get("full_name", "")),
        phone=str(metadata.get("phone", "")),
        contact_email=metadata.get("contact_email"),
        phone_verified=bool(app_metadata.get("phone_verified", False)),
    )
