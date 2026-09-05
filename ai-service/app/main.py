import asyncio
from datetime import datetime, timezone
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.cache import lifespan, redis_client
from app.core.config import settings
from app.core.logger import logger
from app.modules.forecast.router import router as forecast_router
from app.types import HealthResponse, MessageResponse

openapi_tags = [
    {
        "name": "forecast",
        "description": "GRU Machine learning stock price forecasting and time-series projections.",
    },
    {
        "name": "system",
        "description": "Service health checks and operational status endpoints.",
    },
]

app = FastAPI(
    title="StockPros AI Service API",
    version="1.0.0",
    description="Machine Learning stock forecasting microservice using GRU neural networks and technical indicators.",
    docs_url="/docs" if settings.DOCS_ENABLED else None,
    redoc_url="/redoc" if settings.DOCS_ENABLED else None,
    openapi_url="/openapi.json" if settings.DOCS_ENABLED else None,
    openapi_tags=openapi_tags,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(forecast_router)


@app.get(
    "/",
    tags=["system"],
    summary="Service Status",
    description="Returns confirmation that the StockPros AI ML Service is operational.",
)
def root() -> MessageResponse:
    return MessageResponse(message="Stock ML Service is running.")


@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["system"],
    summary="Health Check",
    description="Lightweight public health check for infrastructure monitors, uptime trackers, and load balancers.",
    responses={
        200: {"description": "Service is healthy and ready to accept traffic"},
        503: {"description": "Service unavailable - critical dependency failure"},
    },
)
async def health():
    timestamp = datetime.now(timezone.utc).isoformat()
    try:
        if redis_client is not None:
            await asyncio.wait_for(redis_client.ping(), timeout=2.0)
        return HealthResponse(status="ok", timestamp=timestamp)
    except Exception as e:
        logger.error(f"Health check dependency failure: {e}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unhealthy", "timestamp": timestamp},
        )