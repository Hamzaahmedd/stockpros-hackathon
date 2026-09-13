import os
from typing import Final

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    MODEL_DIR: str = "app/models/saved"
    LOOKBACK: int = 60
    BATCH_SIZE: int = 32

    REDIS_URL: str = ""
    REDIS_TLS_REJECT_UNAUTHORIZED: bool = True
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    TIINGO_API_KEY: str = ""
    APP_ENV: str = "development"
    CACHE_ENABLED: bool = True
    TTL_MULTIPLIER: float = float(1.0)
    GITHUB_TOKEN: str = ""

    # Comma-separated string or fallback list defaults
    CORS_ORIGINS: str = (
        "https://stockpros-platform.vercel.app,"
        "http://localhost:5173,"
        "http://127.0.0.1:5173"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """Parses comma-separated CORS_ORIGINS string into a list of clean strings."""
        if not self.CORS_ORIGINS:
            return []
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def DOCS_ENABLED(self) -> bool:
        # Disabled in production unless explicitly opted-in via DOCS_ENABLED=true.
        # Enabled in all other environments unless explicitly opted-out via DOCS_ENABLED=false.
        raw = os.environ.get("DOCS_ENABLED")
        if self.APP_ENV == "production":
            return raw == "true"
        return raw != "false"


settings: Final[Settings] = Settings()