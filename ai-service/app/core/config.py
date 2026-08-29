import os
from typing import Final

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
    TTL_MULTIPLIER: float = 1.0
    GITHUB_TOKEN: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def DOCS_ENABLED(self) -> bool:
        # Disabled in production unless explicitly opted-in via DOCS_ENABLED=true.
        # Enabled in all other environments unless explicitly opted-out via DOCS_ENABLED=false.
        raw = os.environ.get("DOCS_ENABLED")
        if self.APP_ENV == "production":
            return raw == "true"
        return raw != "false"


settings: Final[Settings] = Settings()