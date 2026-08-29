"""
Centralized Redis/FastAPI-Cache TTL constants for the AI service.

Grouped by business domain using human-readable time arithmetic.
All values are in seconds unless explicitly suffixed with _MS.
"""
from typing import Final


class CacheTTL:
    """Domain-grouped TTL constants (in seconds) for the AI microservice."""

    # ── Forecast Predictions ──────────────────────────────────────────────────
    # GRU model predictions are computationally expensive; cache for 1 hour.
    FORECAST_PREDICTIONS: Final[int] = 60 * 60  # 1 hour (3,600 s)

    # ── System / Health ───────────────────────────────────────────────────────
    # Health check responses should never be long-lived cached.
    HEALTH_RESPONSE: Final[int] = 0  # Not cached
