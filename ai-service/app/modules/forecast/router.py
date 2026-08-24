from fastapi import APIRouter, BackgroundTasks, Query
from fastapi_cache.decorator import cache

from app.schemas.prediction import ForecastResponse
from app.modules.forecast.service import create_forecast

router = APIRouter(prefix="/api/v1", tags=["forecast"])


@router.get("/forecast", response_model=ForecastResponse)
@cache(expire=3600)
async def forecast(
    background_tasks: BackgroundTasks,
    symbol: str = Query(..., description="Ticker symbol"),
    period: str = Query("1d", pattern="^(1d|1w)$"),
) -> ForecastResponse:
    return await create_forecast(background_tasks, symbol, period)
