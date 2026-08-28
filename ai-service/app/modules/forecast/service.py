# app/modules/forecast/service.py
import os
import time
from typing import Any, cast

import numpy as np
import pandas as pd
from fastapi import BackgroundTasks, HTTPException

from app.core import cache as redis_service
from app.core.logger import logger
from app.modules.forecast.schemas import ForecastResponse, PricePoint
from app.services.data_service import fetch_stock_data
from app.services.model_service import (
    APP_ENV,
    get_model_path,
    is_model_stale,
    is_model_stale_in_supabase,
    predict_for_period,
    sync_model_from_supabase,
    train_and_upload,
    trigger_background_training,
)


async def create_forecast(
    background_tasks: BackgroundTasks,
    symbol: str,
    period: str,
) -> ForecastResponse:
    try:
        df = fetch_stock_data(symbol)
        if df.empty:
            raise HTTPException(status_code=404, detail="No data available")

        symbol_up = symbol.upper()
        local_model_path = get_model_path(symbol_up)
        model_exists = os.path.exists(local_model_path)
        is_stale = (
            is_model_stale_in_supabase(symbol_up)
            if APP_ENV == "prod"
            else model_exists and is_model_stale(local_model_path)
        )

        if not model_exists or is_stale:
            sync_success = await sync_model_from_supabase(symbol_up)
            if sync_success:
                model_exists = True
                is_stale = False

        if not model_exists or is_stale:
            current_eta = await _schedule_training(
                background_tasks, df, symbol_up
            )
            if not model_exists:
                return ForecastResponse(
                    symbol=symbol_up,
                    period=period,
                    currentPrice=round(float(df["raw_close"].iloc[-1]), 2),
                    status="training",
                    message=(
                        "Training in progress. Estimated completion in "
                        f"{max(0, (current_eta or 0) - int(time.time()))}s."
                    ),
                    estimated_ready_at=current_eta,
                    historicalData=[],
                    predictions=[],
                )

        historical_data = _historical_data(df)
        preds = cast(
            list[dict[str, Any]], predict_for_period(df, period, symbol_up)
        )

        predictions: list[PricePoint] = []
        for prediction in preds:
            raw_val = prediction.get(
                "predicted_close", prediction.get("price")
            )
            price_val = round(float(str(raw_val)), 2)
            predictions.append(
                PricePoint(
                    date=str(prediction["date"]),
                    price=price_val,
                )
            )

        return ForecastResponse(
            symbol=symbol_up,
            period=period,
            currentPrice=round(float(df["raw_close"].iloc[-1]), 2),
            historicalData=historical_data,
            predictions=predictions,
            status="success",
        )
    except HTTPException:
        raise
    except Exception as error:
        logger.error(f"Forecast Error for {symbol}: {error}")
        raise HTTPException(
            status_code=500,
            detail=f"Forecast failed for {symbol}. {error}",
        ) from error


def _historical_data(df: pd.DataFrame) -> list[PricePoint]:
    historical_df = df[["date", "close"]].tail(60).copy()
    historical_df = historical_df.rename(columns={"close": "price"})

    # Safe float conversion via np.float64 and explicit date string formatting
    price_series: Any = historical_df["price"]
    historical_df["price"] = price_series.astype(np.float64).round(2)
    historical_df["date"] = historical_df["date"].dt.strftime("%Y-%m-%d")

    records = cast(
        list[dict[str, Any]], historical_df.to_dict(orient="records")
    )
    return [
        PricePoint(date=str(rec["date"]), price=float(rec["price"]))
        for rec in records
    ]


async def _schedule_training(
    background_tasks: BackgroundTasks,
    df: pd.DataFrame,
    symbol: str,
) -> int | None:
    lock_key = f"training:{symbol}"
    estimated_completion = int(time.time()) + 120
    current_eta: int | None = None

    if redis_service.redis_client is not None:
        client: Any = redis_service.redis_client
        success = await client.set(
            lock_key, str(estimated_completion), ex=300, nx=True
        )

        if success:
            if APP_ENV == "prod":
                background_tasks.add_task(trigger_background_training, symbol)
            else:
                background_tasks.add_task(train_and_upload, df, symbol)
            current_eta = estimated_completion
        else:
            raw_eta = await client.get(lock_key)
            if raw_eta:
                try:
                    value = (
                        raw_eta.decode()
                        if isinstance(raw_eta, bytes)
                        else str(raw_eta)
                    )
                    current_eta = int(value)
                except (ValueError, TypeError):
                    current_eta = estimated_completion
            else:
                current_eta = estimated_completion

    return current_eta