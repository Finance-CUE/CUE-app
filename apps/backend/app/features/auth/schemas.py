"""Request and response contracts for the auth API.

Every request model sets `extra="forbid"`: an unexpected field is a 422, not a
silently ignored value. This is the whitelist that keeps client-supplied data
from ever reaching Supabase unchecked.
"""

import re

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.features.auth.identifiers import InvalidPhoneNumberError, normalise_phone

# Supabase hashes with bcrypt, which silently truncates past 72 bytes. Reject
# rather than accept a password whose tail does nothing.
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 72

_HAS_LETTER = re.compile(r"[A-Za-z]")
_HAS_DIGIT = re.compile(r"\d")


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _validate_password(value: str) -> str:
    if len(value) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters.")
    if len(value.encode("utf-8")) > PASSWORD_MAX_LENGTH:
        raise ValueError("Password is too long.")
    if not _HAS_LETTER.search(value) or not _HAS_DIGIT.search(value):
        raise ValueError("Password must contain at least one letter and one number.")
    return value


def _validate_phone(value: str) -> str:
    try:
        return normalise_phone(value)
    except InvalidPhoneNumberError as exc:
        raise ValueError(str(exc)) from exc


class SignupRequest(_StrictModel):
    full_name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    phone: str
    password: str

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        return _validate_phone(value)

    @field_validator("password")
    @classmethod
    def _password(cls, value: str) -> str:
        return _validate_password(value)

    @field_validator("full_name")
    @classmethod
    def _full_name(cls, value: str) -> str:
        # Names are echoed back into the app; keep control characters out.
        if any(character.isascii() and not character.isprintable() for character in value):
            raise ValueError("Name contains unsupported characters.")
        return value


class LoginRequest(_StrictModel):
    phone: str
    password: str = Field(min_length=1, max_length=200)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        return _validate_phone(value)


class RefreshRequest(_StrictModel):
    refresh_token: str = Field(min_length=1, max_length=2000)


class UserResponse(BaseModel):
    id: str
    full_name: str
    phone: str
    contact_email: str | None = None
    phone_verified: bool = False


class SessionResponse(BaseModel):
    """Only these fields ever reach the client. No Supabase URL, no keys."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse
