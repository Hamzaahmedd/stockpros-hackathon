# app/core/config.py
from typing import Final

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    MODEL_DIR: str = "app/models/saved"
    MODEL_FILE: str = "app/models/saved/gru_stock_model.keras"
    LOOKBACK: int = 60
    EPOCHS: int = 15
    BATCH_SIZE: int = 32

    # Provide default empty string initializers so static type checkers 
    # don't expect them as positional/keyword arguments in Settings()
    REDIS_URL: str = ""
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