# app/utils/indicators.py
from typing import Any, cast
import numpy as np
import pandas as pd


def _to_float_series(series: "pd.Series[float]") -> "pd.Series[float]":
    """Safely squeeze and convert to Series[float] without stub conflicts."""
    s_obj = cast(Any, series).squeeze()
    if isinstance(s_obj, pd.Series):
        return cast("pd.Series[float]", cast(Any, s_obj).astype(np.float64))

    val = float(cast(float, s_obj))
    return cast("pd.Series[float]", pd.Series([val], dtype=np.float64))


def compute_rsi(
    series: "pd.Series[float]", period: int = 14
) -> "pd.Series[float]":
    s = _to_float_series(series)

    delta: pd.Series[float] = s.diff()
    gain: pd.Series[float] = (
        delta.clip(lower=0).rolling(window=period, min_periods=1).mean()
    )
    loss: pd.Series[float] = (
        (-delta.clip(upper=0)).rolling(window=period, min_periods=1).mean()
    )

    safe_loss_arr: Any = np.where(loss == 0, 1e-8, loss)
    safe_loss = pd.Series(safe_loss_arr, index=loss.index, dtype=np.float64)

    rs: pd.Series[float] = gain / safe_loss
    rsi: pd.Series[float] = 100 - (100 / (1 + rs))

    return rsi.ffill().bfill()


def compute_macd(
    series: "pd.Series[float]",
    short: int = 12,
    long: int = 26,
    signal: int = 9,
) -> tuple["pd.Series[float]", "pd.Series[float]"]:
    s = _to_float_series(series)

    short_ema: pd.Series[float] = s.ewm(span=short, adjust=False).mean()
    long_ema: pd.Series[float] = s.ewm(span=long, adjust=False).mean()

    macd_line: pd.Series[float] = short_ema - long_ema
    signal_line: pd.Series[float] = macd_line.ewm(
        span=signal, adjust=False
    ).mean()

    return macd_line.ffill().bfill(), signal_line.ffill().bfill()