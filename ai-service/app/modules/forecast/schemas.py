"""Forecast feature response models.

All models use Pydantic v2 so FastAPI's built-in OpenAPI generator
produces accurate schemas at /openapi.json and /docs.
"""
from pydantic import BaseModel, Field


class PricePoint(BaseModel):
    """A single date ↔ price pair used for both historical and predicted data."""

    date: str = Field(..., description="ISO-8601 date string", examples=["2025-08-29"])
    price: float = Field(..., description="Closing price in USD", examples=[187.32])


class ForecastResponse(BaseModel):
    """Complete forecast payload returned by the forecast endpoint."""

    symbol: str = Field(..., description="Ticker symbol", examples=["AAPL"])
    period: str = Field(
        ...,
        description="Forecast horizon",
        examples=["1w"],
        pattern="^(1d|1w)$",
    )
    currentPrice: float = Field(
        ..., description="Latest known closing price", examples=[187.32]
    )
    historicalData: list[PricePoint] = Field(
        default_factory=list,
        description="Historical prices used as model input",
    )
    predictions: list[PricePoint] = Field(
        default_factory=list,
        description="Predicted future prices",
    )
    status: str | None = Field(
        default="success",
        description="'success' when predictions are ready, 'training' when the model is still being fitted",
    )
    message: str | None = Field(
        default=None,
        description="Human-readable status message (populated when status != success)",
    )
    estimated_ready_at: int | None = Field(
        default=None,
        description="Unix timestamp (seconds) when the model is expected to finish training",
    )
