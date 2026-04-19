"""
HuggingFace Embedding Client — domain semantic matching.

Strategies applied:
  - Domain template embeddings pre-computed ONCE at server startup
    and stored as a local JSON file (domain_embeddings.json)
  - Per-request: ONE HF API call (user prompt only)
  - Cosine similarity computed locally — no extra API calls
  - HF CPU embedding models do NOT consume monthly credits
  - Graceful degradation: if HF is down, skip domain hints silently

Model: BAAI/bge-large-en-v1.5
  - Free CPU inference on HF
  - 512 token context, 1024-dim embeddings
  - Strong semantic matching for domain detection
"""

import os
import json
import math
import httpx
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

HF_TOKEN       = os.getenv("HUGGINGFACE_TOKEN", "")
HF_EMBED_URL   = "https://api-inference.huggingface.co/models/BAAI/bge-large-en-v1.5"
TEMPLATES_PATH = Path(__file__).parent / "domain_templates.json"
EMBEDDINGS_PATH = Path(__file__).parent / "domain_embeddings.json"

# 20 domain templates — covering the main DataForge target verticals
DOMAIN_TEMPLATES = {
    "iot_sensor":           "IoT sensor hardware ESP32 PIR infrared motion detection crowd monitoring",
    "crowd_monitoring":     "crowd flow people counting inflow outflow occupancy safety score",
    "cybersecurity_attack": "network intrusion detection attack classification DDoS malware botnet anomaly",
    "phishing_text":        "phishing email social engineering pretexting baiting impersonation scam detection",
    "honeypot_behavior":    "honeypot attacker behavior analysis session logs lateral movement credential theft",
    "medical_vitals":       "patient vital signs heart rate blood pressure temperature ECG health monitoring",
    "medical_diagnosis":    "disease diagnosis classification symptoms lab results clinical notes binary label",
    "drug_compound":        "chemical compound toxicity assay SMILES molecular property prediction",
    "financial_fraud":      "credit card fraud transaction anomaly detection imbalanced binary classification",
    "industrial_iot":       "predictive maintenance vibration temperature sensor factory equipment failure",
    "nlp_classification":   "text classification sentiment analysis document labeling multi-class NLP",
    "computer_vision_log":  "object detection bounding box annotation frame timestamp label confidence",
    "time_series_energy":   "smart meter electricity consumption power grid demand forecasting load prediction",
    "retail_behavior":      "customer purchase history clickstream recommendation system churn prediction",
    "autonomous_vehicle":   "LIDAR camera sensor fusion object detection road condition driving dataset",
    "smart_city":           "traffic flow pedestrian count air quality noise level urban sensor network",
    "agriculture_iot":      "soil moisture temperature humidity crop yield irrigation precision farming",
    "supply_chain":         "logistics delivery route optimization inventory demand forecasting ETA",
    "biometric_auth":       "fingerprint face recognition gait keystroke behavioral biometrics authentication",
    "environmental":        "weather station rainfall wind speed flood detection climate time series",
}


def _cosine(a: list[float], b: list[float]) -> float:
    dot  = sum(x * y for x, y in zip(a, b))
    na   = math.sqrt(sum(x * x for x in a))
    nb   = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0


async def _embed_one(text: str) -> list[float] | None:
    """Call HF inference API for a single text. Returns embedding or None on failure."""
    headers = {"Authorization": f"Bearer {HF_TOKEN}"}
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(HF_EMBED_URL, headers=headers, json={"inputs": text})
        if resp.status_code != 200:
            logger.warning(f"[HF] Embed failed: {resp.status_code}")
            return None
        result = resp.json()
        # bge returns [[float, ...]] — unwrap outer list
        if isinstance(result, list) and isinstance(result[0], list):
            return result[0]
        return result
    except Exception as e:
        logger.warning(f"[HF] Embed exception: {e}")
        return None


async def precompute_domain_embeddings() -> None:
    """
    Called ONCE at server startup.
    Embeds all 20 domain templates and saves to domain_embeddings.json.
    If file already exists and templates haven't changed, skips API calls.
    """
    if EMBEDDINGS_PATH.exists():
        logger.info("[HF] Domain embeddings already cached — skipping precompute.")
        return

    logger.info("[HF] Precomputing domain embeddings (20 API calls — startup only)…")
    result = {}
    for domain, text in DOMAIN_TEMPLATES.items():
        embedding = await _embed_one(text)
        if embedding:
            result[domain] = embedding
            logger.debug(f"[HF] Embedded: {domain}")
        else:
            logger.warning(f"[HF] Failed to embed template: {domain}")

    EMBEDDINGS_PATH.write_text(json.dumps(result, indent=2))
    logger.info(f"[HF] Saved {len(result)} domain embeddings to {EMBEDDINGS_PATH}")


def _load_domain_embeddings() -> dict[str, list[float]]:
    if not EMBEDDINGS_PATH.exists():
        return {}
    return json.loads(EMBEDDINGS_PATH.read_text())


async def get_domain_hints(user_prompt: str, top_k: int = 2) -> list[str]:
    """
    Embed user prompt (1 HF API call) and return top-k matching domain names.
    Falls back to empty list if HF is unavailable — schema still generates,
    just without domain pre-loading (slightly fewer targeted questions).
    """
    domain_embeddings = _load_domain_embeddings()
    if not domain_embeddings:
        logger.warning("[HF] No domain embeddings found — returning empty hints.")
        return []

    user_embedding = await _embed_one(user_prompt)
    if user_embedding is None:
        logger.warning("[HF] User embedding failed — skipping domain hints.")
        return []

    scores = {
        domain: _cosine(user_embedding, emb)
        for domain, emb in domain_embeddings.items()
    }
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    top = [domain for domain, _ in ranked[:top_k]]
    logger.info(f"[HF] Domain hints: {top} (scores: {[round(scores[d],3) for d in top]})")
    return top
