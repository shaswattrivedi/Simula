"""
Time-Series Dataset Generator — pure Python, zero LLM calls.
Uses numpy + statsmodels for realistic sensor-style data generation.
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


def _inject_events(signal: np.ndarray, events: list[dict], n: int) -> np.ndarray:
    """Inject discrete events (spikes, steps, oscillations) into a signal."""
    for event in events:
        prob      = event.get("probability", 0.01)
        sig       = event.get("signature", "spike")
        magnitude = event.get("magnitude", 3.0)

        event_indices = np.where(np.random.rand(n) < prob)[0]
        for idx in event_indices:
            if sig == "spike":
                # Instant spike
                window = min(5, n - idx)
                decay  = np.exp(-np.arange(window))
                signal[idx:idx + window] += magnitude * np.std(signal[:idx+1] or [1]) * decay

            elif sig == "step":
                # Permanent level shift
                signal[idx:] += magnitude * np.std(signal[:idx+1] or [1])

            elif sig == "oscillation":
                # Short burst of oscillation
                duration = min(20, n - idx)
                t        = np.arange(duration)
                signal[idx:idx + duration] += magnitude * np.sin(2 * np.pi * t / 8) * np.exp(-t / 10)

    return signal


def generate_timeseries(schema: dict, n_rows: int) -> pd.DataFrame:
    """
    Generate a time-series dataset from a schema dict.
    Schema must have a time_config field.

    Produces columns:
      - timestamp (ISO format)
      - one column per sensor/metric defined in schema columns
      - label column if defined
    """
    time_cfg = schema.get("time_config") or {}
    freq_s   = time_cfg.get("frequency_seconds", 5)
    noise    = time_cfg.get("noise_std", 1.0)
    trend    = time_cfg.get("trend", 0.0)
    seas_per = time_cfg.get("seasonality_period_hours", None)
    events   = time_cfg.get("events", [])

    n = max(1, min(n_rows, 50_000))

    # Build timestamp index
    start_time = datetime(2024, 1, 1, 0, 0, 0)
    timestamps = [start_time + timedelta(seconds=i * freq_s) for i in range(n)]
    t          = np.arange(n)

    columns_spec = schema.get("columns", [])
    data = {"timestamp": timestamps}

    for col in columns_spec:
        if col.get("type") == "timestamp":
            continue

        params  = col.get("params", {})
        base    = params.get("mean", params.get("base", 0.0))
        std     = params.get("std", noise)

        # Base signal with noise
        signal = base + std * np.random.randn(n)

        # Add trend
        if trend != 0:
            signal += trend * t / n

        # Add seasonality
        if seas_per:
            period_samples = (seas_per * 3600) / freq_s
            amplitude      = params.get("seasonality_amplitude", std * 0.5)
            signal += amplitude * np.sin(2 * np.pi * t / period_samples)

        # Inject events
        if events and not col.get("is_label"):
            signal = _inject_events(signal, events, n)

        # Type enforcement
        dtype = col.get("type", "float")
        if dtype == "int":
            signal = np.round(signal).astype(int)
        elif dtype == "boolean":
            signal = (signal > base).astype(int)

        data[col["name"]] = signal

    # Generate label column if defined
    label_column = schema.get("label_column")
    class_balance = schema.get("class_balance", {})
    if label_column and label_column not in data and class_balance:
        classes = list(class_balance.keys())
        probs   = list(class_balance.values())
        probs   = [p / sum(probs) for p in probs]
        data[label_column] = np.random.choice(classes, size=n, p=probs)

    df = pd.DataFrame(data)
    logger.info(f"[TimeSeries] Generated {len(df)} rows × {len(df.columns)} columns, freq={freq_s}s.")
    return df
