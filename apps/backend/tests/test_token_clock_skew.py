import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.api.dependencies.auth import get_current_claims

ISSUER = "https://example.supabase.co/auth/v1"


def _call(iat_offset: int):
    key = ec.generate_private_key(ec.SECP256R1())
    now = int(time.time())
    token = jwt.encode(
        {"sub": "u", "aud": "authenticated", "iss": ISSUER,
         "iat": now + iat_offset, "exp": now + 3600},
        key, algorithm="ES256",
    )
    jwk_client = SimpleNamespace(
        get_signing_key_from_jwt=lambda _t: SimpleNamespace(key=key.public_key())
    )
    return get_current_claims(
        HTTPAuthorizationCredentials(scheme="Bearer", credentials=token),
        jwk_client,
        SimpleNamespace(jwt_issuer=ISSUER),
    )


def test_token_issued_a_moment_in_our_future_is_accepted():
    assert _call(5)["sub"] == "u"


def test_token_far_in_the_future_is_still_rejected():
    with pytest.raises(HTTPException):
        _call(600)
