"""StockPros AI Service — FastAPI entry point.

Interactive documentation:
  - Swagger UI:  /docs
  - ReDoc:       /redoc
  - Raw OpenAPI: /openapi.json

Docs are enabled in local/development mode and automatically
disabled when APP_ENV=prod (set docs_url, redoc_url, and
openapi_url to None).

Infrastructure monitoring:
  - GET /health — public, unauthenticated liveness probe with an
    optional Redis readiness ping.  Kept free of any request-scoped
    analytics/audit middleware so uptime polling stays fast and free.
"""
import asyncio
import time
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core import cache
from app.core.cache import lifespan
from app.core.config import settings
from app.core.logger import logger
from app.modules.forecast.router import router as forecast_router
from app.types import HealthResponse, MessageResponse

# ─── OpenAPI metadata ─────────────────────────────────────────────────────────

_is_prod = settings.APP_ENV.strip().lower() in ("prod", "production")

app = FastAPI(
    title="StockPros AI Service",
    version="1.0.0",
    description=(
        "Microservice for AI-powered stock price forecasting using GRU-based "
        "time-series models.  Provides historical data retrieval, model training, "
        "and multi-step price predictions."
    ),
    contact={"name": "StockPros Engineering"},
    lifespan=lifespan,
    # Disable interactive docs in production for safety.
    docs_url="/docs" if not _is_prod else None,
    redoc_url="/redoc" if not _is_prod else None,
    openapi_url="/openapi.json" if not _is_prod else None,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────

origins = [
    "https://stockplatform.vercel.app",
    "https://stockpros-platform.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────

app.include_router(forecast_router)


# ─── Root endpoints ──────────────────────────────────────────────────────────

@app.get(
    "/",
    response_model=MessageResponse,
    tags=["Health"],
    summary="Service root",
)
def root() -> MessageResponse:
    """Confirm the AI microservice is running."""
    return MessageResponse(message="Stock ML Service is running.")


# ─── Health probe internals ─────────────────────────────────────────────────

_HEALTH_CACHE_TTL_S = 5.0
_REDIS_PING_TIMEOUT_S = 1.5

# (is_healthy, expires_at_monotonic) — caches dependency probes so
# high-frequency uptime polling cannot hammer Redis.
_health_cache: tuple[bool, float] | None = None


def _utc_now_iso() -> str:
    """Current UTC time as ISO-8601 with millisecond precision (…Z suffix)."""
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


async def _dependencies_healthy() -> bool:
    """Probe configured infrastructure dependencies.

    Redis is pinged only when it was connected at startup — a service
    started without REDIS_URL (or whose initial connection failed) runs
    uncached by design, so the probe is skipped.  Raw exceptions are
    logged server-side and never surfaced to the response payload.
    """
    global _health_cache

    now = time.monotonic()
    if _health_cache is not None and _health_cache[1] > now:
        return _health_cache[0]

    healthy = True
    if cache.redis_client is not None:
        try:
            await asyncio.wait_for(
                cache.redis_client.ping(), _REDIS_PING_TIMEOUT_S
            )
        except Exception:  # noqa: BLE001 — details stay out of the payload
            healthy = False
            logger.warning("Health check: Redis ping failed.")

    _health_cache = (healthy, now + _HEALTH_CACHE_TTL_S)
    return healthy


@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["Health"],
    summary="Health check",
    description=(
        "Public liveness probe for uptime monitors and platform health "
        "checks.  Pings Redis when it is configured and responds 503 with "
        '`status: "error"` when it is unreachable.  Never exposes '
        "internal error details, hostnames, or credentials."
    ),
)
async def health() -> HealthResponse | JSONResponse:
    """Lightweight liveness probe (dependency results cached for 5s)."""
    if not await _dependencies_healthy():
        return JSONResponse(
            status_code=503,
            content={"status": "error", "timestamp": _utc_now_iso()},
        )
    return HealthResponse(status="ok", timestamp=_utc_now_iso())
