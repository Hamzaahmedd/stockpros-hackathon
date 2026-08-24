# train_script.py
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false

import argparse
from datetime import datetime, timedelta
import gc
import os
from typing import Any, cast

import numpy as np
import pandas as pd
import requests
from sklearn.preprocessing import MinMaxScaler  # type: ignore

TIINGO_API_KEY: str = os.environ["TIINGO_API_KEY"]
SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_KEY: str = os.environ["SUPABASE_KEY"]
BUCKET_NAME: str = "models"

FEATURE_COLS: list[str] = ["close", "volume", "sma_50", "rsi", "macd", "signal"]
LOOKBACK: int = 60
STEPS_AHEAD: int = 5
EPOCHS: int = 20
BATCH_SIZE: int = 32

def log(message: str) -> None:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}", flush=True)

def _to_float_series(series: "pd.Series[float]") -> "pd.Series[float]":
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


def fetch_stock_data(symbol: str) -> pd.DataFrame:
    log(f"FETCHING DATA: Requesting 5 years of history for {symbol}...")
    start_date = (datetime.now() - timedelta(days=5 * 365)).strftime(
        "%Y-%m-%d"
    )
    url = f"https://api.tiingo.com/tiingo/daily/{symbol}/prices"
    params = {"startDate": start_date, "token": TIINGO_API_KEY}

    response = requests.get(url, params=params, timeout=60)
    response.raise_for_status()
    data = cast(list[dict[str, Any]], response.json())

    if not data:
        raise ValueError(f"No data returned for symbol '{symbol}'")

    raw_df = pd.DataFrame(data)
    df = pd.DataFrame()
    
    df["date"] = cast(Any, pd).to_datetime(raw_df["date"]).dt.tz_localize(None)

    df["close"] = (
        raw_df["adjClose"] if "adjClose" in raw_df.columns else raw_df["close"]
    )
    df["volume"] = (
        raw_df["adjVolume"] if "adjVolume" in raw_df.columns else raw_df["volume"]
    )

    numeric_cols = ["close", "volume"]
    for col in numeric_cols:
        converted_series = cast(Any, pd).to_numeric(df[col], errors="coerce")
        df[col] = converted_series.astype(np.float32)

    df = df.sort_values("date").reset_index(drop=True)

    close_series = cast("pd.Series[float]", df["close"])
    df["sma_50"] = close_series.rolling(window=50).mean()
    df["rsi"] = compute_rsi(close_series)
    df["macd"], df["signal"] = compute_macd(close_series)

    df_clean = cast(Any, df).dropna()
    df_result = cast(pd.DataFrame, df_clean.reset_index(drop=True))

    print(f"Data ready: {len(df_result)} rows for {symbol}.")
    log("SUCCESS: Data fetched and technical indicators computed.")
    return df_result


def prepare_multivariate(
    df: pd.DataFrame,
) -> tuple[
    np.ndarray[Any, np.dtype[np.float32]],
    np.ndarray[Any, np.dtype[np.float32]],
    Any,
]:
    values: Any = df[FEATURE_COLS].values.astype(np.float32)
    # Passed ints instead of floats to satisfy sklearn stub
    scaler: Any = MinMaxScaler(feature_range=(0, 1))
    scaled: Any = scaler.fit_transform(values).astype(np.float32)

    x_list: list[Any] = []
    y_list: list[Any] = []
    close_idx = FEATURE_COLS.index("close")

    for i in range(LOOKBACK, len(scaled) - STEPS_AHEAD + 1):
        x_list.append(scaled[i - LOOKBACK : i, :])
        y_list.append(scaled[i : i + STEPS_AHEAD, close_idx])

    return np.array(x_list), np.array(y_list), scaler


def build_gru_model(n_features: int) -> Any:
    from tensorflow.keras.layers import Dense, Dropout, GRU, Input  # type: ignore
    from tensorflow.keras.models import Sequential  # type: ignore

    model: Any = Sequential(
        [
            Input(shape=(LOOKBACK, n_features)),
            GRU(128, return_sequences=True),
            Dropout(0.2),
            GRU(64, return_sequences=False),
            Dropout(0.2),
            Dense(STEPS_AHEAD),
        ]
    )
    model.compile(optimizer="adam", loss="mean_squared_error")
    return model


def train_model(df: pd.DataFrame) -> Any:
    from tensorflow.keras.callbacks import EarlyStopping  # type: ignore

    print("Preparing training data...")
    x_train, y_train, _ = prepare_multivariate(df)
    model = build_gru_model(len(FEATURE_COLS))

    early_stop = EarlyStopping(
        monitor="val_loss",
        patience=3,
        restore_best_weights=True,
    )
    print(
        f"Training GRU model (max {EPOCHS} epochs, early stopping on val_loss)..."
    )
    model.fit(
        x_train,
        y_train,
        epochs=EPOCHS,
        batch_size=BATCH_SIZE,
        validation_split=0.2,
        verbose=1,
        callbacks=[early_stop],
    )
    log("SUCCESS: Model training completed.")
    return model


def convert_to_onnx(model: Any, output_path: str) -> None:
    import tensorflow as tf  # type: ignore
    import tf2onnx  # type: ignore

    log(f"Starting ONNX conversion: {output_path}")

    try:
        spec = (
            tf.TensorSpec(
                (None, LOOKBACK, len(FEATURE_COLS)), tf.float32, name="input"
            ),
        )
        model_proto, _ = tf2onnx.convert.from_keras(
            model, input_signature=spec, opset=13
        )

        with open(output_path, "wb") as f:
            f.write(model_proto.SerializeToString())

        log(f"SUCCESS: ONNX model saved to {output_path}")

    except Exception as e:
        log(f"❌ CONVERSION ERROR: {str(e)}")
        raise RuntimeError(f"ONNX conversion failed: {e}") from e


def upload_to_supabase(onnx_path: str, symbol: str) -> None:
    from supabase import create_client  # type: ignore

    print(f"Uploading {symbol}.onnx to Supabase bucket '{BUCKET_NAME}'...")
    client: Any = create_client(SUPABASE_URL, SUPABASE_KEY)

    with open(onnx_path, "rb") as f:
        client.storage.from_(BUCKET_NAME).upload(
            path=f"{symbol.upper()}.onnx",
            file=f,
            file_options={"cache-control": "3600", "upsert": "true"},
        )

    print(f"Upload complete: {symbol.upper()}.onnx is now in Supabase.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train a GRU model for a stock symbol."
    )
    parser.add_argument(
        "--symbol", required=True, help="Ticker symbol, e.g. AAPL"
    )
    args = parser.parse_args()
    symbol: str = args.symbol.upper()

    log(f"🚀 PIPELINE STARTED for {symbol}")

    try:
        df = fetch_stock_data(symbol)
    except Exception as e:
        log(f"❌ DATA ERROR: {str(e)}")
        raise SystemExit(1) from e

    try:
        model = train_model(df)
    except Exception as e:
        log(f"❌ TRAINING ERROR: {str(e)}")
        raise SystemExit(1) from e

    try:
        onnx_filename = f"{symbol}.onnx"
        convert_to_onnx(model, onnx_filename)
        del model
        gc.collect()
    except Exception as e:
        log(f"❌ CONVERSION ERROR: {str(e)}")
        raise SystemExit(1) from e

    try:
        upload_to_supabase(onnx_filename, symbol)
    except Exception as e:
        log(f"❌ UPLOAD ERROR: {str(e)}")
        raise SystemExit(1) from e

    log(
        f"✅ PIPELINE FINISHED: {symbol}.onnx is now live in Supabase Storage."
    )


if __name__ == "__main__":
    main()