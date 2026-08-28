# app/services/model_service.py
import os
from typing import Any, List, Tuple, cast

APP_ENV = os.getenv('APP_ENV', 'local')

# Global type placeholders initialized before conditional imports
tf: Any = None
_Sequential: Any = None
load_model: Any = None
gru_layer: Any = None
dense_layer: Any = None
dropout_layer: Any = None
input_layer: Any = None
early_stopping: Any = None
ort: Any = None

# CRITICAL FIX: TensorFlow must be imported BEFORE numpy/pandas/requests on Windows
if APP_ENV == 'local':
    import tensorflow as tf  # type: ignore
    from tensorflow.keras.models import Sequential as _Sequential, load_model  # type: ignore
    from tensorflow.keras.layers import GRU as gru_layer, Dense as dense_layer, Dropout as dropout_layer, Input as input_layer  # type: ignore
    from tensorflow.keras.callbacks import EarlyStopping as early_stopping  # type: ignore
elif APP_ENV == 'prod':
    import onnxruntime as ort  # type: ignore[reportMissingTypeStubs]

# Remaining standard library & third-party imports
import gc
import tempfile
import subprocess
import sys
import time
from datetime import datetime, timezone
import requests
import numpy as np
import pandas as pd
from numpy.typing import NDArray
from sklearn.preprocessing import MinMaxScaler
from app.core.config import settings
from app.core.logger import logger
from supabase import create_client, Client

def trigger_background_training(symbol: str) -> bool:
    """Triggers the GitHub Action to train the model in the background."""
    repo_owner = "Stock-App-Platform"
    repo_name = "stock-ml"
    github_token = settings.GITHUB_TOKEN

    url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/dispatches"

    headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3+json"
    }

    payload: dict[str, Any] = {
        "event_type": "train_model",
        "client_payload": {"symbol": symbol}
    }

    try:
        response = requests.post(url, headers=headers, json=payload)
        if response.status_code == 204:
            logger.info(f"Successfully triggered GitHub Action training for {symbol}")
            return True
        else:
            logger.error(f"Failed to trigger GitHub Action: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        logger.error(f"Exception triggering background training: {e}")
        return False

FEATURE_COLS: List[str] = ["close", "volume", "sma_50", "rsi", "macd", "signal"]

# Initialize Supabase Client
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
BUCKET_NAME = "models"

def get_model_path(symbol: str, extension: str | None = None) -> str:
    if extension is None:
        extension = "onnx" if APP_ENV == "prod" else "keras"
    # Unified naming: Just SYMBOL.extension
    return os.path.join(settings.MODEL_DIR, f"{symbol.upper()}.{extension}")

async def sync_model_from_supabase(symbol: str) -> bool:
    """Downloads the ONNX model from Supabase to local Render disk if it exists."""
    remote_path = f"{symbol.upper()}.onnx"
    local_path = get_model_path(symbol, "onnx")

    try:
        os.makedirs(settings.MODEL_DIR, exist_ok=True)

        # Download from Supabase
        res = supabase.storage.from_(BUCKET_NAME).download(remote_path)

        # Safety Fix: Ensure we got bytes, not an error dictionary
        if isinstance(res, bytes):
            with open(local_path, "wb") as f:
                f.write(res)
        else:
            raise ValueError(f"Supabase returned non-byte response: {res}")

        if symbol in MODEL_CACHE:
            del MODEL_CACHE[symbol]

        logger.info(f"Successfully synced {symbol} ONNX model from Supabase.")
        return True
    except Exception as e:
        logger.warning(f"No existing ONNX model for {symbol} in Supabase: {e}")
        # Clean up if a partial/error file was created
        if os.path.exists(local_path):
            os.remove(local_path)
        return False

def convert_to_onnx(model: Any, output_path: str) -> None:
    """Internal helper to convert a Keras model to ONNX."""
    logger.info(f"Converting model to ONNX: {output_path}")

    with tempfile.TemporaryDirectory() as temp_dir:
        logger.info("Exporting to temporary SavedModel for conversion...")
        try:
            # Keras 3 approach
            model.export(temp_dir)
        except AttributeError:
            # Fallback for Keras 2 / tf.keras
            tf.saved_model.save(model, temp_dir)  # type: ignore[reportUnknownMemberType]

        logger.info("Running tf2onnx converter...")
        result = subprocess.run([
            sys.executable, "-m", "tf2onnx.convert",
            "--saved-model", temp_dir,
            "--output", output_path,
            "--opset", "13"
        ], capture_output=True, text=True)

        if result.returncode != 0:
            logger.error(f"tf2onnx conversion stdout: {result.stdout}\nstderr: {result.stderr}")
            raise RuntimeError(f"tf2onnx conversion failed: {result.stderr}")

        logger.info(f"Successfully saved ONNX to {output_path}")

def train_and_upload(df: pd.DataFrame, symbol: str) -> None:
    """Trains locally as .keras, converts to .onnx, and uploads ONLY the .onnx to Supabase."""
    try:
        if APP_ENV == 'prod':
            logger.warning("Training should not run in prod.")
            return

        logger.info(f"Starting background training for {symbol}...")

        # 1. Train and save as .keras
        model, _ = train_and_save_model(df, symbol)
        onnx_path = get_model_path(symbol, "onnx")

        # Invalidate memory cache immediately so next local inference uses the new model
        if symbol in MODEL_CACHE:
            del MODEL_CACHE[symbol]

        # 2. Convert to ONNX immediately after training
        convert_to_onnx(model, onnx_path)

        # 3. Upload ONLY the .onnx file to Supabase
        with open(onnx_path, "rb") as f:
            supabase.storage.from_(BUCKET_NAME).upload(
                path=f"{symbol.upper()}.onnx",
                file=f,
                file_options={"cache-control": "3600", "upsert": "true"}
            )
        logger.info(f"Background training, conversion, and ONNX upload complete for {symbol}.")

        # Optional: Clean up memory
        del model
        gc.collect()

    except Exception as e:
        logger.error(f"Background training/conversion failed for {symbol}: {e}")

def _prepare_multivariate(
    df: pd.DataFrame,
    lookback: int,
    steps_ahead: int = 5,
) -> Tuple[NDArray[np.float32], NDArray[np.float32], MinMaxScaler]:
    values = df[FEATURE_COLS].values.astype(np.float32)
    scaler = MinMaxScaler(feature_range=(0, 1))
    scaler_api: Any = scaler
    scaled = cast(NDArray[np.float32], scaler_api.fit_transform(values)).astype(np.float32)

    X: list[NDArray[np.float32]] = []
    y: list[NDArray[np.float32]] = []
    close_idx = FEATURE_COLS.index("close")
    for i in range(lookback, len(scaled) - steps_ahead + 1):
        X.append(scaled[i - lookback:i, :])
        y.append(scaled[i:i + steps_ahead, close_idx])

    return np.array(X), np.array(y), scaler

def _build_gru_model_multivariate(lookback: int, n_features: int, steps_ahead: int = 5) -> Any:
    if APP_ENV == "prod":
        raise RuntimeError("Cannot build/train models in production environment.")

    model = _Sequential()
    model.add(input_layer(shape=(lookback, n_features)))
    model.add(gru_layer(128, return_sequences=True))
    model.add(dropout_layer(0.2))
    model.add(gru_layer(64, return_sequences=False))
    model.add(dropout_layer(0.2))
    model.add(dense_layer(steps_ahead))
    model.compile(optimizer="adam", loss="mean_squared_error")
    return model

def _ensure_model_dir() -> None:
    os.makedirs(settings.MODEL_DIR, exist_ok=True)

def train_and_save_model(df: pd.DataFrame, symbol: str) -> Tuple[Any, MinMaxScaler]:
    lookback = settings.LOOKBACK
    n_features = len(FEATURE_COLS)
    steps_ahead = 5
    X_train, y_train, scaler = _prepare_multivariate(df, lookback, steps_ahead)
    model = _build_gru_model_multivariate(lookback, n_features, steps_ahead)
    _ensure_model_dir()
    early_stop = early_stopping(
        monitor="val_loss",
        patience=3,
        restore_best_weights=True
    )
    model.fit(
        X_train, y_train,
        epochs=20,                          # High ceiling — EarlyStopping cuts it short
        batch_size=settings.BATCH_SIZE,
        validation_split=0.2,
        verbose=1,
        callbacks=[early_stop]
    )

    model_path = get_model_path(symbol)
    model.save(model_path)
    return model, scaler

def is_model_stale(filepath: str, max_days: int = 7) -> bool:
    """Check local file age. Used in local env only."""
    if not os.path.exists(filepath):
        return True
    file_time = os.path.getmtime(filepath)
    return (time.time() - file_time) > (max_days * 86400)

def is_model_stale_in_supabase(symbol: str, max_days: int = 7) -> bool:
    """In prod, check the ONNX file's upload timestamp in Supabase.
    Render's ephemeral disk timestamps are always 'new' so local mtime is useless.
    Returns True if the file is missing or older than max_days.
    """
    try:
        remote_path = f"{symbol.upper()}.onnx"
        files = supabase.storage.from_(BUCKET_NAME).list()
        for f in files:
            if f.get("name") == remote_path:
                updated_at = f.get("updated_at") or f.get("created_at")
                if not updated_at:
                    return True
                dt = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
                age_seconds = (datetime.now(timezone.utc) - dt).total_seconds()
                return age_seconds > (max_days * 86400)
        return True  # File not found in bucket → treat as stale
    except Exception as e:
        logger.warning(f"Could not check Supabase staleness for {symbol}: {e}")
        return False  # Fail safe: don't retrain if we can't check

MODEL_CACHE: dict[str, Any] = {}

def load_model_if_exists(df_for_scaler: pd.DataFrame, symbol: str) -> Tuple[Any, MinMaxScaler]:
    model_path = get_model_path(symbol)

    # Return from cache if already loaded
    if symbol in MODEL_CACHE:
        _, _, scaler = _prepare_multivariate(df_for_scaler, settings.LOOKBACK, 5)
        return MODEL_CACHE[symbol], scaler

    if os.path.exists(model_path):
        logger.info(f"Loading existing model from {model_path} into cache...")
        _, _, scaler = _prepare_multivariate(df_for_scaler, settings.LOOKBACK, 5)

        if APP_ENV == 'prod':
            model = ort.InferenceSession(model_path)
        else:
            model = load_model(model_path)

        MODEL_CACHE[symbol] = model
        return model, scaler
    else:
        logger.warning(f"Model file {model_path} not found — training a new one")
        if APP_ENV == 'prod':
            raise FileNotFoundError(f"Model file {model_path} not found in PROD. Ensure it is uploaded.")

        model, scaler = train_and_save_model(df_for_scaler, symbol)
        MODEL_CACHE[symbol] = model
        return model, scaler

def predict_multi_step(
    df: pd.DataFrame,
    steps: int,
    symbol: str,
) -> NDArray[np.float32]:
    lookback = settings.LOOKBACK
    model, scaler = load_model_if_exists(df, symbol)

    if len(df) < lookback:
        raise ValueError(f"Not enough data to create input sequence: got {len(df)}, need {lookback}")

    last_seq = df[FEATURE_COLS].values[-lookback:].astype(np.float32)
    scaler_api = cast(Any, scaler)
    last_scaled = cast(NDArray[np.float32], scaler_api.transform(last_seq)).astype(np.float32)
    current_input = last_scaled[np.newaxis, :, :]

    if APP_ENV == 'prod':
        current_input = current_input.astype(np.float32)
        input_name = model.get_inputs()[0].name
        pred_scaled = model.run(None, {input_name: current_input})[0]
    else:
        pred_scaled = model.predict(current_input, verbose=0)

    preds_scaled = pred_scaled[0, :steps]

    preds_arr = np.array(preds_scaled).reshape(-1, 1)
    close_min = cast(NDArray[np.float32], cast(Any, scaler).min_)[0]
    close_scale = cast(NDArray[np.float32], cast(Any, scaler).scale_)[0]
    preds_unscaled = preds_arr / close_scale - close_min / close_scale

    # Garbage collect to prevent memory leaks on Render's 512MB RAM tier
    gc.collect()

    return cast(NDArray[np.float32], preds_unscaled.reshape(-1))

def get_trading_dates(start_date: pd.Timestamp, num_days: int) -> List[pd.Timestamp]:
    dates: List[pd.Timestamp] = []
    current = start_date
    while len(dates) < num_days:
        current += pd.Timedelta(days=1)
        if current.weekday() < 5:  # Monday=0, Friday=4
            dates.append(current)
    return dates

def predict_for_period(
    df: pd.DataFrame,
    period: str,
    symbol: str,
) -> list[dict[str, object]]:
    period_map = {"1d": 1, "1w": 5}  # trading days
    last_df_date = df["date"].max()
    steps = period_map.get(period, 1)
    preds = predict_multi_step(df, steps, symbol)
    dates = get_trading_dates(last_df_date, steps)

    predictions_with_dates: list[dict[str, object]] = [
        {"date": date.strftime("%Y-%m-%d"), "predicted_close": float(round(p, 2))}
        for date, p in zip(dates, preds)
    ]

    return predictions_with_dates