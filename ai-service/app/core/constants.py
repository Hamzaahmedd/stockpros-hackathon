"""Centralized Redis cache TTL constants, grouped by domain.

Every cache TTL used by the service must come from :class:`CacheTTL` —
no inline magic numbers in routers or services.  Base values are
expressed in seconds through human-readable duration arithmetic.

Environment behavior is controlled by a single operational knob,
``settings.CACHE_TTL_MULTIPLIER`` (1.0 by default, 0 in test runs),
applied through :func:`effective_ttl`.  When the multiplier is <= 0
the cache backend is never initialized (see ``app.core.cache``), so
responses are served uncached and tests never wait on expiration.
"""
from typing import Final

from app.core.config import settings

_MINUTE: Final[int] = 60
_HOUR: Final[int] = 60 * _MINUTE


class CacheTTL:
    """Base Redis TTLs in seconds, grouped by domain."""

    # ── Forecast ──────────────────────────────────────────────────────
    #: GRU forecast responses per (symbol, period) query.
    FORECAST_RESPONSE: Final[int] = 1 * _HOUR


def effective_ttl(base_seconds: int) -> int:
    """Scale a base TTL by the environment-wide multiplier.

    Clamped to a minimum of 1 second because Redis rejects ``EX 0``;
    a multiplier of 0 disables caching upstream instead (the backend
    is simply not initialized).
    """
    return max(int(base_seconds * settings.CACHE_TTL_MULTIPLIER), 1)
