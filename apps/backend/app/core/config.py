from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, loaded from apps/backend/.env.

    Every Supabase credential lives here and nowhere else. Nothing in this
    class is ever serialised into an API response or sent to a client.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["development", "staging", "production"] = "development"

    supabase_url: str
    supabase_publishable_key: str
    supabase_secret_key: str
    supabase_jwks_url: str

    # NoDecode: without it pydantic-settings JSON-decodes list fields straight
    # from .env and a comma-separated value raises before any validator runs.
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)

    @field_validator("supabase_url")
    @classmethod
    def _strip_trailing_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def auth_base_url(self) -> str:
        return f"{self.supabase_url}/auth/v1"

    @property
    def jwt_issuer(self) -> str:
        return self.auth_base_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
