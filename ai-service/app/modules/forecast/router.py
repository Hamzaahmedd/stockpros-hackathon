from fastapi import APIRouter, BackgroundTasks, Query
from fastapi_cache.decorator import cache

from app.core.constants import CacheTTL
from app.modules.forecast.schemas import ForecastResponse
from app.modules.forecast.service import create_forecast

router = APIRouter(prefix="/api/v1", tags=["forecast"])


@router.get(
    "/forecast",
    response_model=ForecastResponse,
    summary="Generate Stock Price Forecast",
    description="Calculates time-series stock price projections (1d or 1w) using trained GRU models along with historical comparison points.",
)
@cache(expire=CacheTTL.FORECAST_PREDICTIONS)
async def forecast(
    background_tasks: BackgroundTasks,
    symbol: str = Query(..., description="Ticker symbol (e.g., AAPL, NVDA, TSLA)"),
    period: str = Query("1w", pattern="^(1d|1w)$", description="Forecast projection window: 1d or 1w"),
) -> ForecastResponse:
    return await create_forecast(background_tasks, symbol, period)
