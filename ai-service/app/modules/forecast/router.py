"""Forecast API router.

Exposes the GRU model predictions via a single GET endpoint with
response caching (``CacheTTL.FORECAST_RESPONSE``).
"""
from fastapi import APIRouter, BackgroundTasks, Query
from fastapi_cache.decorator import cache

from app.core.constants import CacheTTL, effective_ttl
from app.modules.forecast.schemas import ForecastResponse
from app.modules.forecast.service import create_forecast

router = APIRouter(prefix="/api/v1", tags=["Forecast"])


@router.get(
    "/forecast",
    response_model=ForecastResponse,
    summary="Get AI stock price forecast",
    description=(
        "Returns historical prices and GRU-model predictions for the given "
        "ticker symbol.  If the model is still training, the response will "
        "include `status: 'training'` and an `estimated_ready_at` timestamp."
    ),
)
@cache(expire=effective_ttl(CacheTTL.FORECAST_RESPONSE))
async def forecast(
    background_tasks: BackgroundTasks,
    symbol: str = Query(
        ...,
        description="Ticker symbol (e.g. AAPL, TSLA, MSFT)",
        examples=["AAPL"],
    ),
    period: str = Query(
        "1w",
        description="Forecast horizon",
        pattern="^(1d|1w)$",
        examples=["1w", "1d"],
    ),
) -> ForecastResponse:
    """Run the GRU forecast pipeline for **symbol** over **period**."""
    return await create_forecast(background_tasks, symbol, period)
