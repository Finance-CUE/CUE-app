"""Test environment. Set before any app module imports Settings.

Real credentials in apps/backend/.env are never read by tests: environment
variables take priority over the dotenv file.
"""

import os

os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("SUPABASE_URL", "https://test-ref.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
os.environ.setdefault("SUPABASE_SECRET_KEY", "sb_secret_test")
os.environ.setdefault(
    "SUPABASE_JWKS_URL",
    "https://test-ref.supabase.co/auth/v1/.well-known/jwks.json",
)
