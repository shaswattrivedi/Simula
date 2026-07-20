"""
Dataset Quality Scoring — Zero ML friction, built for accessibility.
Runs health checks (volume, completeness, diversity) instead of hard ML benchmarks.
"""

import pandas as pd
import logging

logger = logging.getLogger(__name__)

def run_scoring(df: pd.DataFrame, schema: dict) -> dict:
    """
    Run health checks on a generated dataset.
    Returns score 0-100 and a breakdown of health metrics mapped to the frontend contract.
    Zero ML dependencies.
    """
    if df.empty:
        return {
            "learnability_score": 0,
            "best_model": "N/A",
            "task_type": "Data Generation",
            "model_scores": [],
            "error": "Dataset is empty."
        }
        
    score = 100
    checks = []

    # 1. Volume Check
    num_rows = len(df)
    if num_rows >= 1000:
        checks.append({"model": "Volume (Optimal)", "score": 1.0, "cv_scores": []})
    elif num_rows >= 100:
        checks.append({"model": "Volume (Acceptable)", "score": 0.8, "cv_scores": []})
        score -= 5
    else:
        checks.append({"model": "Volume (Low)", "score": 0.5, "cv_scores": []})
        score -= 15

    # 2. Completeness Check
    total_cells = df.shape[0] * df.shape[1]
    missing_cells = int(df.isnull().sum().sum())
    
    if missing_cells == 0:
        checks.append({"model": "Completeness (Perfect)", "score": 1.0, "cv_scores": []})
    else:
        missing_ratio = missing_cells / max(1, total_cells)
        penalty = min(40, missing_ratio * 100)
        checks.append({"model": f"Completeness ({missing_cells} Missing)", "score": max(0.2, 1.0 - missing_ratio), "cv_scores": []})
        score -= penalty

    # 3. Categorical Diversity Check
    cat_cols = df.select_dtypes(include=["object", "category", "bool"]).columns
    has_cardinality_issue = False
    
    for c in cat_cols:
        if df[c].nunique() < 2:
            has_cardinality_issue = True
            
    if len(cat_cols) == 0:
        checks.append({"model": "Structure (Pure Numeric)", "score": 0.95, "cv_scores": []})
        score -= 2
    elif not has_cardinality_issue:
        checks.append({"model": "Diversity (Rich Categories)", "score": 1.0, "cv_scores": []})
    else:
        checks.append({"model": "Diversity (Single-Value Variance)", "score": 0.6, "cv_scores": []})
        score -= 10

    # Clean boundaries
    score = max(0, min(100, int(score)))

    return {
        "learnability_score": score,
        "best_model": "Quality Assured",
        "task_type": "Integrity Check",
        "model_scores": checks,
        "rows_used": num_rows,
        "features_used": len(df.columns),
    }
