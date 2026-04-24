"""
Tabular Dataset Generator — pure Python, zero LLM calls.
Uses scipy.stats for distribution generation + numpy for correlation injection.
"""

import numpy as np
import pandas as pd
from scipy import stats
from scipy.linalg import cholesky, LinAlgError
import logging

logger = logging.getLogger(__name__)


def _generate_column(col_spec: dict, n: int) -> np.ndarray:
    dist   = col_spec.get("distribution", "normal")
    params = col_spec.get("params", {})
    dtype  = col_spec.get("type", "float")

    if dist == "normal":
        mean = params.get("mean", 0.0)
        std  = params.get("std", 1.0)
        data = stats.norm.rvs(loc=mean, scale=std, size=n)

    elif dist == "uniform":
        low  = params.get("low", 0.0)
        high = params.get("high", 1.0)
        data = stats.uniform.rvs(loc=low, scale=high - low, size=n)

    elif dist == "lognormal":
        mean = params.get("mean", 0.0)
        std  = params.get("std", 1.0)
        data = stats.lognorm.rvs(s=std, scale=np.exp(mean), size=n)

    elif dist == "poisson":
        lam  = params.get("lambda", 5)
        data = stats.poisson.rvs(mu=lam, size=n).astype(float)

    elif dist == "bernoulli":
        p    = params.get("p", 0.5)
        data = stats.bernoulli.rvs(p=p, size=n).astype(float)

    elif dist == "categorical":
        categories = params.get("categories", [])
        # If no categories provided, generate sensible defaults from column name
        if not categories:
            col_name = col_spec.get("name", "value").lower()
            if "id" in col_name:
                categories = [f"{col_name.upper()}_{i:03d}" for i in range(1, 6)]
            elif "status" in col_name or "state" in col_name:
                categories = ["active", "inactive", "pending", "error"]
            elif "level" in col_name or "risk" in col_name:
                categories = ["low", "medium", "high", "critical"]
            elif "type" in col_name:
                categories = ["type_A", "type_B", "type_C"]
            else:
                categories = ["class_1", "class_2", "class_3"]
        weights = params.get("weights", None)
        if weights and len(weights) == len(categories):
            w = np.array(weights, dtype=float)
            weights = (w / w.sum()).tolist()
        data = np.random.choice(categories, size=n, p=weights)
        return data

    elif dist == "timestamp":
        from datetime import datetime, timedelta
        start = datetime(2024, 1, 1, 0, 0, 0)
        freq_s = params.get("frequency_seconds", 1)
        timestamps = [str(start + timedelta(seconds=i * freq_s)) for i in range(n)]
        return np.array(timestamps)

    else:
        data = stats.norm.rvs(size=n)

    # Cast to declared dtype
    if dtype == "int":
        data = np.round(data).astype(int)
    elif dtype == "boolean":
        data = (data > 0.5).astype(bool)

    return data


def _inject_correlations(df: pd.DataFrame, correlations: list[dict]) -> pd.DataFrame:
    """
    Inject pairwise correlations between numeric columns using
    Cholesky decomposition. Preserves marginal distributions.
    Only operates on float columns — skips categoricals.
    """
    if not correlations:
        return df

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    if len(numeric_cols) < 2:
        return df

    # Build target correlation matrix
    n = len(numeric_cols)
    target_corr = np.eye(n)
    col_idx = {c: i for i, c in enumerate(numeric_cols)}

    for corr_spec in correlations:
        ca = corr_spec.get("col_a", "")
        cb = corr_spec.get("col_b", "")
        s  = corr_spec.get("strength", 0.5)
        d  = corr_spec.get("direction", "positive")
        if ca in col_idx and cb in col_idx:
            r = abs(s) * (1 if d == "positive" else -1)
            target_corr[col_idx[ca]][col_idx[cb]] = r
            target_corr[col_idx[cb]][col_idx[ca]] = r

    # Ensure positive-definite (fix any near-singular matrix)
    try:
        L = cholesky(target_corr, lower=True)
    except LinAlgError:
        logger.warning("[Tabular] Correlation matrix not positive-definite — skipping correlation injection.")
        return df

    # Transform to normal, apply Cholesky, transform back via rank
    norm_data = np.zeros((len(df), n))
    for i, col in enumerate(numeric_cols):
        norm_data[:, i] = stats.rankdata(df[col]) / (len(df) + 1)
        norm_data[:, i] = stats.norm.ppf(np.clip(norm_data[:, i], 1e-6, 1 - 1e-6))

    corr_data = norm_data @ L.T
    for i, col in enumerate(numeric_cols):
        ranks = stats.rankdata(corr_data[:, i])
        df[col] = np.sort(df[col].values)[np.argsort(np.argsort(ranks))]

    return df


def generate_tabular(schema: dict, n_rows: int) -> pd.DataFrame:
    """
    Generate a tabular dataset from a schema dict.
    Returns a pandas DataFrame ready for CSV export.
    """
    columns_spec = schema.get("columns", [])
    correlations = schema.get("correlations", [])
    label_column = schema.get("label_column", None)
    class_balance = schema.get("class_balance", {})

    if not columns_spec:
        raise ValueError("Schema has no columns defined.")

    n = max(1, min(n_rows, 50_000))
    data = {}

    # Generate each column independently first
    for col in columns_spec:
        if col.get("is_label") and class_balance:
            # Generate label with specified class balance
            classes = list(class_balance.keys())
            probs   = list(class_balance.values())
            probs   = [p / sum(probs) for p in probs]  # Normalize
            data[col["name"]] = np.random.choice(classes, size=n, p=probs)
        else:
            data[col["name"]] = _generate_column(col, n)

    df = pd.DataFrame(data)

    # Inject correlations between numeric columns
    df = _inject_correlations(df, correlations)

    # Enforce declared dtypes
    for col in columns_spec:
        name = col["name"]
        if name not in df.columns:
            continue
        dtype = col.get("type", "float")
        try:
            if dtype == "int":
                df[name] = pd.to_numeric(df[name], errors="coerce").fillna(0).astype(int)
            elif dtype == "float":
                df[name] = pd.to_numeric(df[name], errors="coerce").fillna(0.0)
            elif dtype == "boolean":
                df[name] = df[name].astype(bool)
        except Exception as e:
            logger.warning(f"[Tabular] Dtype cast failed for {name}: {e}")

    logger.info(f"[Tabular] Generated {len(df)} rows × {len(df.columns)} columns.")
    return df
