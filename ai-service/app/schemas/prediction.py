# app/schemas/prediction.py
from pydantic import BaseModel

class PricePoint(BaseModel):
    date: str
    price: float

class ForecastResponse(BaseModel):
    symbol: str
    period: str
    currentPrice: float
    historicalData: list[PricePoint]
    predictions: list[PricePoint]
    status: str | None = "success"
    message: str | None = None
    estimated_ready_at: int | None = None