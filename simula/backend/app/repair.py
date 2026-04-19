"""
Dataset Repair Pipeline — pure pandas + sklearn + imbalanced-learn.
Zero LLM calls. Returns repaired DataFrame + before/after report.
"""

import io
import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder
import logging

logger = logging.getLogger(__name__)


def _diagnose(df: pd.DataFrame) -> dict:
    """Produce a before-repair diagnosis report."""
    report = {}
    for col in df.columns:
        nan_pct  = round(df[col].isna().mean() * 100, 2)
        dtype    = str(df[col].dtype)
        n_unique = df[col].nunique()
        report[col] = {"nan_pct": nan_pct, "dtype": dtype, "n_unique": n_unique}

    # Class imbalance on likely label column (last column or 'label'/'target' named)
    label_candidates = [c for c in df.columns if c.lower() in ("label", "target", "class", "y")]
    if label_candidates:
        lc = label_candidates[0]
        dist = df[lc].value_counts(normalize=True).round(4).to_dict()
        report["_label_distribution"] = dist

    report["_summary"] = {
        "rows": len(df),
        "columns": len(df.columns),
        "total_nan_pct": round(df.isna().mean().mean() * 100, 2),
        "duplicate_rows": int(df.duplicated().sum()),
    }
    return report


def run_repair(csv_bytes: bytes) -> tuple[pd.DataFrame, dict]:
    """
    Full repair pipeline on a CSV file.
    Returns (repaired_df, {before: report, after: report, changes: list}).
    """
    df = pd.read_csv(io.BytesIO(csv_bytes))
    before_report = _diagnose(df)
    changes = []

    # 1. Drop fully empty columns
    empty_cols = [c for c in df.columns if df[c].isna().all()]
    if empty_cols:
        df.drop(columns=empty_cols, inplace=True)
        changes.append(f"Dropped {len(empty_cols)} fully-empty columns: {empty_cols}")

    # 2. Drop duplicate rows
    n_dupes = df.duplicated().sum()
    if n_dupes > 0:
        df.drop_duplicates(inplace=True)
        df.reset_index(drop=True, inplace=True)
        changes.append(f"Removed {n_dupes} duplicate rows.")

    # 3. Impute NaN — numeric: median, categorical: mode
    for col in df.columns:
        nan_count = df[col].isna().sum()
        if nan_count == 0:
            continue
        if pd.api.types.is_numeric_dtype(df[col]):
            fill_val = df[col].median()
            df[col].fillna(fill_val, inplace=True)
            changes.append(f"Imputed {nan_count} NaN in '{col}' with median ({fill_val:.3g}).")
        else:
            fill_val = df[col].mode().iloc[0] if not df[col].mode().empty else "UNKNOWN"
            df[col].fillna(fill_val, inplace=True)
            changes.append(f"Imputed {nan_count} NaN in '{col}' with mode ('{fill_val}').")

    # 4. Outlier clipping on numeric columns (IQR method)
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    for col in numeric_cols:
        q1, q3 = df[col].quantile(0.25), df[col].quantile(0.75)
        iqr    = q3 - q1
        lower, upper = q1 - 3 * iqr, q3 + 3 * iqr
        outliers = ((df[col] < lower) | (df[col] > upper)).sum()
        if outliers > 0:
            df[col] = df[col].clip(lower=lower, upper=upper)
            changes.append(f"Clipped {outliers} outliers in '{col}' to [{lower:.3g}, {upper:.3g}].")

    # 5. Class imbalance — SMOTE on label columns if severe imbalance detected
    label_candidates = [c for c in df.columns if c.lower() in ("label", "target", "class", "y")]
    if label_candidates:
        lc = label_candidates[0]
        class_counts = df[lc].value_counts()
        if len(class_counts) >= 2:
            min_class_ratio = class_counts.min() / class_counts.max()
            if min_class_ratio < 0.3:
                try:
                    from imblearn.over_sampling import SMOTE
                    feature_cols = [c for c in numeric_cols if c != lc]
                    if len(feature_cols) >= 2:
                        X = df[feature_cols].values
                        le = LabelEncoder()
                        y  = le.fit_transform(df[lc].astype(str))
                        k  = min(5, class_counts.min() - 1)
                        if k >= 1:
                            sm = SMOTE(k_neighbors=k, random_state=42)
                            X_res, y_res = sm.fit_resample(X, y)
                            df_res = pd.DataFrame(X_res, columns=feature_cols)
                            df_res[lc] = le.inverse_transform(y_res)
                            # Re-add non-numeric columns sampled with replacement
                            non_numeric = [c for c in df.columns if c not in feature_cols and c != lc]
                            for c in non_numeric:
                                df_res[c] = df[c].sample(n=len(df_res), replace=True, random_state=42).values
                            df = df_res[df.columns]
                            changes.append(f"Applied SMOTE to balance '{lc}' (ratio was {min_class_ratio:.2f}).")
                except ImportError:
                    changes.append(f"SMOTE skipped — imbalanced-learn not installed.")
                except Exception as e:
                    logger.warning(f"[Repair] SMOTE failed: {e}")

    after_report = _diagnose(df)

    report = {
        "before": before_report,
        "after": after_report,
        "changes": changes,
        "rows_before": before_report["_summary"]["rows"],
        "rows_after": len(df),
    }
    logger.info(f"[Repair] Done. {len(changes)} changes applied.")
    return df, report
