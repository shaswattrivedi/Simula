"""
Learnability Scoring — pure sklearn, zero LLM calls.
Contextually selects 3 best-fit models based on schema properties.
Returns a score 0–100 with per-model breakdown.
"""

import numpy as np
import pandas as pd
from sklearn.model_selection import cross_val_score, StratifiedKFold, KFold
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import make_scorer, f1_score
import logging

logger = logging.getLogger(__name__)


def _select_models(schema: dict, is_classification: bool) -> list[tuple[str, object]]:
    """Select 3 most appropriate models based on schema characteristics."""
    n_cols    = len(schema.get("columns", []))
    n_classes = len(schema.get("class_balance", {}))

    if is_classification:
        models = [("Random Forest", RandomForestClassifier(n_estimators=50, random_state=42, n_jobs=-1))]
        if n_cols <= 30:
            models.append(("Logistic Regression", LogisticRegression(max_iter=500, random_state=42)))
        if n_classes == 2:
            from sklearn.svm import LinearSVC
            models.append(("Linear SVC", LinearSVC(max_iter=1000, random_state=42)))
        else:
            from sklearn.naive_bayes import GaussianNB
            models.append(("Naive Bayes", GaussianNB()))
    else:
        models = [
            ("Random Forest", RandomForestRegressor(n_estimators=50, random_state=42, n_jobs=-1)),
            ("Ridge Regression", Ridge()),
        ]
        from sklearn.svm import SVR
        models.append(("SVR", SVR(kernel="rbf")))

    return models[:3]


def run_scoring(df: pd.DataFrame, schema: dict) -> dict:
    """
    Run learnability scoring on a generated dataset.
    Returns score 0-100, per-model breakdown, and recommended model name.
    No LLM calls — pure sklearn.
    """
    label_col = schema.get("label_column")
    if not label_col or label_col not in df.columns:
        return {
            "learnability_score": 0,
            "best_model": "N/A",
            "task_type": "unknown",
            "model_scores": [],
            "error": "No label column found in dataset."
        }

    # Separate features and label
    feature_cols = [c for c in df.columns if c != label_col and c != "timestamp"]
    if not feature_cols:
        return {
            "learnability_score": 0,
            "best_model": "N/A",
            "task_type": "unknown",
            "model_scores": [],
            "error": "No feature columns available for scoring."
        }

    X = df[feature_cols].copy()
    y = df[label_col].copy()

    # Encode categoricals
    for col in X.select_dtypes(include=["object", "bool"]).columns:
        X[col] = LabelEncoder().fit_transform(X[col].astype(str))
    X = X.fillna(0)

    # Determine task type
    is_classification = y.dtype == object or y.nunique() <= 20
    task_type = "classification" if is_classification else "regression"

    if is_classification:
        le = LabelEncoder()
        y  = le.fit_transform(y.astype(str))

        n_classes = int(np.unique(y).size)
        rows_used = int(len(y))
        if n_classes < 2:
            return {
                "learnability_score": 0,
                "best_model": "N/A",
                "task_type": task_type,
                "model_scores": [],
                "rows_used": rows_used,
                "features_used": len(feature_cols),
                "error": "At least two classes are required for classification scoring. Your label currently has only one class.",
            }

        unique_ratio = n_classes / max(1, rows_used)
        if n_classes > 50 and unique_ratio > 0.1:
            return {
                "learnability_score": 0,
                "best_model": "N/A",
                "task_type": task_type,
                "model_scores": [],
                "rows_used": rows_used,
                "features_used": len(feature_cols),
                "error": (
                    "Label appears high-cardinality (ID-like): "
                    f"{n_classes} unique classes across {rows_used} rows. "
                    "Choose a target label with fewer repeated classes (e.g., alert_level/event_type)."
                ),
            }

        class_counts = np.bincount(y)
        min_class_count = int(class_counts.min()) if class_counts.size else 0
        n_splits = min(5, min_class_count, len(y))

        if n_splits < 2:
            return {
                "learnability_score": 0,
                "best_model": "N/A",
                "task_type": task_type,
                "model_scores": [],
                "rows_used": rows_used,
                "features_used": len(feature_cols),
                "error": (
                    "Not enough samples per class for cross-validation. "
                    f"Smallest class has {min_class_count} row(s); need at least 2 per class."
                ),
            }

        cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
        scoring = "f1_weighted"
    else:
        y  = pd.to_numeric(y, errors="coerce").fillna(0).values
        n_splits = min(5, len(y))
        if n_splits < 2:
            return {
                "learnability_score": 0,
                "best_model": "N/A",
                "task_type": task_type,
                "model_scores": [],
                "rows_used": len(df),
                "features_used": len(feature_cols),
                "error": "Not enough rows for regression cross-validation. Need at least 2 rows.",
            }

        cv = KFold(n_splits=n_splits, shuffle=True, random_state=42)
        scoring = "r2"

    # Scale features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    models = _select_models(schema, is_classification)
    model_scores = []

    for name, model in models:
        try:
            scores = cross_val_score(model, X_scaled, y, cv=cv, scoring=scoring, n_jobs=-1)
            mean_score = float(np.mean(scores))
            model_scores.append({"model": name, "score": round(mean_score, 4), "cv_scores": [round(s, 4) for s in scores.tolist()]})
            logger.info(f"[Scoring] {name}: {mean_score:.4f}")
        except Exception as e:
            logger.warning(f"[Scoring] {name} failed: {e}")
            model_scores.append({"model": name, "score": 0.0, "cv_scores": [], "error": str(e)})

    if not model_scores:
        return {"learnability_score": 0, "best_model": "N/A", "task_type": task_type, "model_scores": []}

    # Learnability score: normalized average of top model scores → 0-100
    best = max(model_scores, key=lambda x: x["score"])
    raw  = max(0.0, min(1.0, best["score"]))  # Clip to [0,1]
    learnability_score = round(raw * 100, 1)

    return {
        "learnability_score": learnability_score,
        "best_model": best["model"],
        "task_type": task_type,
        "model_scores": model_scores,
        "rows_used": len(df),
        "features_used": len(feature_cols),
    }
