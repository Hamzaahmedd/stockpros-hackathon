# app/services/redis.py
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
import importlib
import os
import threading
from typing import Any, cast

from fastapi import FastAPI
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
# pyright: reportMissingTypeStubs=false
import redis.asyncio as redis

REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

# Global Redis client instance
redis_client: redis.Redis | None = None


def load_ml_libraries() -> None:
    """Starts the 'heavy' imports in a background thread."""
    try:
        print("Pre-loading heavy ML libraries in background...")

        importlib.import_module("app.services.data_service")
        importlib.import_module("app.services.model_service")
        print("ML Libraries loaded and ready in background!")
    except Exception as e:
        print(f"Background warm-up failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    global redis_client
    thread = threading.Thread(target=load_ml_libraries)
    thread.start()

    kwargs: dict[str, Any] = {"encoding": "utf8", "decode_responses": False}
    if REDIS_URL.startswith("rediss://"):
        kwargs["ssl_cert_reqs"] = "none"

    client = cast(Any, redis).from_url(REDIS_URL, **kwargs)
    redis_client = cast(redis.Redis | None, client)

    FastAPICache.init(RedisBackend(cast(redis.Redis, redis_client)), prefix="stockpros-cache")

    yield

    if redis_client is not None:
        await cast(Any, redis_client).close()