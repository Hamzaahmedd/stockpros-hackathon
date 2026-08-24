# app/services/data_service.py
from datetime import datetime, timedelta
from typing import Any, cast

import numpy as np
import pandas as pd
import requests

from app.core.config import settings
from app.utils.indicators import compute_macd, compute_rsi


def fetch_stock_data(symbol: str) -> pd.DataFrame:
    api_key: str = settings.TIINGO_API_KEY

    start_date: str = (datetime.now() - timedelta(days=5 * 365)).strftime(
        "%Y-%m-%d"
    )
    url = f"https://api.tiingo.com/tiingo/daily/{symbol}/prices"
    params: dict[str, str] = {"startDate": start_date, "token": api_key}

    response = requests.get(url, params=params, timeout=60)
    response.raise_for_status()
    data = cast(list[dict[str, Any]], response.json())

    if not data:
        return pd.DataFrame()

    raw_df = pd.DataFrame(data)

    # --- CLEAN SLATE CONSTRUCTION ---
    df = pd.DataFrame()

    # Inline Any cast to prevent Pylance variable overload issues
    df["date"] = cast(Any, pd).to_datetime(raw_df["date"]).dt.tz_localize(None)

    # Map Adjusted to standard names (for ML) and Close to raw_close (for UI)
    df["close"] = (
        raw_df["adjClose"] if "adjClose" in raw_df.columns else raw_df["close"]
    )
    df["raw_close"] = raw_df["close"]
    df["volume"] = (
        raw_df["adjVolume"] if "adjVolume" in raw_df.columns else raw_df["volume"]
    )

    numeric_cols = ["close", "raw_close", "volume"]
    for col in numeric_cols:
        converted_series = cast(Any, pd).to_numeric(df[col], errors="coerce")
        df[col] = converted_series.astype(np.float32)

    df = df.sort_values("date").reset_index(drop=True)

    # Add Indicators
    df = add_technical_indicators(df)
    return df


def add_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    if len(df) < 50:
        return df

    # Narrow 'close' column to pd.Series[float] for indicator functions
    close_series = cast("pd.Series[float]", df["close"])

    # Use 'close' (Adjusted) for all math
    df["sma_50"] = close_series.rolling(window=50).mean()
    df["rsi"] = compute_rsi(close_series)

    macd_val, signal_val = compute_macd(close_series)
    df["macd"] = macd_val
    df["signal"] = signal_val

    # Drop NaNs created by rolling indicators to ensure clean data for the GRU
    df_clean = cast(Any, df).dropna()
    return cast(pd.DataFrame, df_clean.reset_index(drop=True))