"""Request-scoped auth dependencies.

Access tokens are verified locally against Supabase's published JWKS. No network
call per request, and no shared secret sitting in our config for signing - we
only ever verify, never mint.
"""

import logging
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.core.config import Settings, get_settings
from app.features.auth.service import SupabaseAuthClient

logger = logging.getLogger(__name__)

# auto_error=False so a missing header produces our own 401 shape rather than
# FastAPI's default, keeping every auth failure identical to a client.
_bearer = HTTPBearer(auto_error=False)

_UNAUTHORISED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated.",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_auth_client(request: Request) -> SupabaseAuthClient:
    return request.app.state.auth_client


def get_jwk_client(request: Request) -> PyJWKClient:
    return request.app.state.jwk_client


def get_current_claims(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    jwk_client: Annotated[PyJWKClient, Depends(get_jwk_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    """Verify the bearer token and return its claims.

    Signature, expiry, audience and issuer are all checked. A token that fails
    any of them is indistinguishable from a missing one.
    """
    if credentials is None or not credentials.credentials:
        raise _UNAUTHORISED

    try:
        signing_key = jwk_client.get_signing_key_from_jwt(credentials.credentials)
        return jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            issuer=settings.jwt_issuer,
            options={"require": ["exp", "sub", "aud", "iss"]},
        )
    except jwt.PyJWTError as exc:
        logger.info("token rejected: %s", type(exc).__name__)
        raise _UNAUTHORISED from exc


CurrentClaims = Annotated[dict[str, Any], Depends(get_current_claims)]
AuthClient = Annotated[SupabaseAuthClient, Depends(get_auth_client)]
