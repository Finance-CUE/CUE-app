"""Phone number handling for CUE accounts.

CUE users authenticate with an email address and a password - Supabase's native
email+password grant, with the real address as the identifier. A mobile number
is still collected at signup and kept as profile data; it is not a credential.
"""

import re

_DIGITS_ONLY = re.compile(r"^\d{10}$")
_INDIAN_MOBILE_PREFIX = re.compile(r"^[6-9]")
_ALL_SAME_DIGIT = re.compile(r"^(\d)\1{9}$")

COUNTRY_CODE = "91"


class InvalidPhoneNumberError(ValueError):
    """Raised when a submitted phone number is not a valid Indian mobile."""


def normalise_phone(raw: str) -> str:
    """Return a 10-digit Indian mobile number, or raise.

    Mirrors apps/mobile/src/features/auth/utils/phoneValidation.ts. The client
    check is a UX affordance only - this one is the control, because anyone can
    call the API directly.
    """
    phone = re.sub(r"\D", "", raw or "")

    if not _DIGITS_ONLY.match(phone):
        raise InvalidPhoneNumberError("Mobile number must contain exactly 10 digits.")

    if not _INDIAN_MOBILE_PREFIX.match(phone):
        raise InvalidPhoneNumberError("Please enter a valid Indian mobile number.")

    if _ALL_SAME_DIGIT.match(phone):
        raise InvalidPhoneNumberError("Please enter a valid mobile number.")

    return phone


def to_e164(phone: str) -> str:
    """+91XXXXXXXXXX, for display and for future SMS delivery."""
    return f"+{COUNTRY_CODE}{phone}"


def mask_phone(phone: str) -> str:
    """Redacted form for logs. Never log a full mobile number."""
    if len(phone) != 10:
        return "**********"
    return f"{phone[:2]}******{phone[-2:]}"
