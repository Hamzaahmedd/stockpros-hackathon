from typing import Final

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    MODEL_DIR: str = "app/models/saved"
    MODEL_FILE: str = "app/models/saved/gru_stock_model.keras"
    LOOKBACK: int = 60
    EPOCHS: int = 15
    BATCH_SIZE: int = 32

    REDIS_URL: str = ""
    REDIS_TLS_REJECT_UNAUTHORIZED: bool = True
    # Global scale applied to every domain TTL in app/core/constants.py.
    # 1.0 = use TTLs as declared; <= 0 disables response caching entirely
    # (set to 0 in test runs so suites never wait on cache expiration).
    CACHE_TTL_MULTIPLIER: float = 1.0
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    TIINGO_API_KEY: str = ""
    APP_ENV: str = "development"
    GITHUB_TOKEN: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings: Final[Settings] = Settings()