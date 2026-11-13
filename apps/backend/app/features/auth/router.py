"""Auth endpoints.

Rate limits are per client IP. That bounds credential stuffing and email
flooding from a single source; Supabase applies its own per-account limits on top.

ponytail: slowapi keeps counters in process memory, so limits are per worker.
Move to the Redis backend when the API runs more than one worker.

Limits are sized for a group onboarding together behind one shared public IP
(office or event Wi-Fi), not for one person per IP.
"""

import logging

from fastapi import APIRouter, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.api.dependencies.auth import AuthClient, CurrentClaims, Profiles
from app.features.auth.identifiers import mask_phone, to_e164
from app.features.auth.schemas import (
    EmailRequest,
    GoogleSignInRequest,
    LoginRequest,
    PhoneRequest,
    RefreshRequest,
    ResetPasswordRequest,
    SessionResponse,
    SignupPendingResponse,
    SignupRequest,
    UserResponse,
    VerifyEmailRequest,
)
from app.features.auth.service import MSG_PHONE_TAKEN, PhoneTakenError, user_from_claims

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", status_code=status.HTTP_201_CREATED)
@limiter.limit("30/hour")
async def signup(
    request: Request,
    payload: SignupRequest,
    auth: AuthClient,
    profiles: Profiles,
) -> SignupPendingResponse:
    """Create an account and email a verification code. No session until verified.

    One mobile number belongs to one verified account. A number held by an
    abandoned, never-verified signup is released: that account cannot sign in
    and has no data, and keeping it would lock out someone who mistyped their
    email the first time.
    """
    owner = await profiles.phone_owner(to_e164(payload.phone))
    if owner is not None:
        existing = await auth.get_user(owner)
        same_email = existing is not None and (existing.get("email") or "").lower() == payload.email.lower()
        if existing is not None and existing.get("email_confirmed_at"):
            raise PhoneTakenError(MSG_PHONE_TAKEN)
        if existing is not None and not same_email:
            logger.info("releasing %s from an unverified signup", mask_phone(payload.phone))
            await auth.delete_user(owner)

    await auth.sign_up(
        email=payload.email,
        phone=payload.phone,
        password=payload.password,
        full_name=payload.full_name,
    )
    return SignupPendingResponse(email=payload.email)


@router.post("/verify-email")
@limiter.limit("30/minute")
async def verify_email(
    request: Request, payload: VerifyEmailRequest, auth: AuthClient
) -> SessionResponse:
    return await auth.verify_email(email=payload.email, code=payload.code)


@router.post("/resend-code", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/hour")
async def resend_code(request: Request, payload: EmailRequest, auth: AuthClient) -> None:
    await auth.resend_verification(email=payload.email)


@router.post("/login")
@limiter.limit("30/minute")
async def login(
    request: Request,
    payload: LoginRequest,
    auth: AuthClient,
) -> SessionResponse:
    return await auth.sign_in(email=payload.email, password=payload.password)


@router.post("/google")
@limiter.limit("30/minute")
async def google(
    request: Request, payload: GoogleSignInRequest, auth: AuthClient
) -> SessionResponse:
    """Sign in or sign up with Google. A first-time user has no phone yet."""
    return await auth.sign_in_with_google(id_token=payload.id_token)


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/hour")
async def forgot_password(request: Request, payload: EmailRequest, auth: AuthClient) -> None:
    """Always 204, so the endpoint cannot be used to find registered addresses."""
    await auth.request_password_reset(email=payload.email)


@router.post("/reset-password")
@limiter.limit("30/hour")
async def reset_password(
    request: Request, payload: ResetPasswordRequest, auth: AuthClient
) -> SessionResponse:
    return await auth.reset_password(
        email=payload.email, code=payload.code, new_password=payload.new_password
    )


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
    return user_from_claims(claims)


@router.put("/phone")
@limiter.limit("10/minute")
async def set_phone(
    request: Request,
    payload: PhoneRequest,
    claims: CurrentClaims,
    auth: AuthClient,
    profiles: Profiles,
) -> UserResponse:
    """Add a mobile number to an account that has none (Google sign-ups).

    The profile row is written first so its unique index decides races; the
    token metadata follows. The client refreshes its token afterwards so the
    new number appears in /me.
    """
    user = user_from_claims(claims)
    phone_e164 = to_e164(payload.phone)
    await profiles.set_phone(user.id, phone_e164)
    await auth.set_phone_metadata(user.id, phone_e164)
    return user.model_copy(update={"phone": phone_e164})
