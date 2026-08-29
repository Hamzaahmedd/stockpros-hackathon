"""Cache connection and application lifespan (Redis client + startup/shutdown)."""
import threading
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any, cast

# pyright: reportMissingTypeStubs=false
import redis.asyncio as redis
from fastapi import FastAPI
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend

from app.core.config import settings
from app.core.logger import logger

redis_client: redis.Redis | None = None


def load_ml_libraries() -> None:
    """Warm up heavy ML imports in a background thread."""
    import importlib

    try:
        logger.info("Pre-loading heavy ML libraries in background...")
        importlib.import_module("app.services.data_service")
        importlib.import_module("app.services.model_service")
        logger.info("ML libraries loaded and ready in background.")
    except ImportError as e:
        logger.warning(f"Background ML library warm-up failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    global redis_client

    thread = threading.Thread(target=load_ml_libraries)
    thread.start()

    if settings.REDIS_URL:
        kwargs: dict[str, Any] = {"encoding": "utf8", "decode_responses": False}
        if settings.REDIS_URL.startswith("rediss://"):
            kwargs["ssl_cert_reqs"] = (
                "required" if settings.REDIS_TLS_REJECT_UNAUTHORIZED else "none"
            )
        client = cast(Any, redis).from_url(settings.REDIS_URL, **kwargs)
        redis_client = cast("redis.Redis | None", client)
        FastAPICache.init(
            RedisBackend(cast(redis.Redis, redis_client)), prefix="stockpros-cache"
        )
    else:
        logger.warning("REDIS_URL is not configured — response caching is disabled.")

    yield

    if redis_client is not None:
        await cast(Any, redis_client).close()
