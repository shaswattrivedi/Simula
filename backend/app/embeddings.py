"""
Domain matcher — keyword-based, zero API calls, zero cost.
Replaces HuggingFace embedding lookup with local TF-IDF cosine similarity.
No external dependencies beyond sklearn which is already in requirements.txt.
"""

import json
import logging
import math
import re
from pathlib import Path

logger = logging.getLogger(__name__)

DOMAIN_TEMPLATES = {
    "iot_sensor":           "IoT sensor hardware ESP32 PIR infrared motion detection crowd monitoring people counting inflow outflow",
    "crowd_monitoring":     "crowd flow people counting occupancy safety score inflow outflow density monitoring",
    "cybersecurity_attack": "network intrusion detection attack classification DDoS malware botnet anomaly traffic",
    "phishing_text":        "phishing email social engineering pretexting baiting impersonation scam detection text classification",
    "honeypot_behavior":    "honeypot attacker behavior analysis session logs lateral movement credential theft cybersecurity",
    "medical_vitals":       "patient vital signs heart rate blood pressure temperature ECG health monitoring wearable",
    "medical_diagnosis":    "disease diagnosis classification symptoms lab results clinical notes binary label patient",
    "drug_compound":        "chemical compound toxicity assay SMILES molecular property prediction drug discovery",
    "financial_fraud":      "credit card fraud transaction anomaly detection imbalanced binary classification finance",
    "industrial_iot":       "predictive maintenance vibration temperature sensor factory equipment failure industrial",
    "nlp_classification":   "text classification sentiment analysis document labeling multi-class NLP language",
    "time_series_energy":   "smart meter electricity consumption power grid demand forecasting load prediction energy",
    "retail_behavior":      "customer purchase history clickstream recommendation system churn prediction retail",
    "smart_city":           "traffic flow pedestrian count air quality noise level urban sensor network city",
    "agriculture_iot":      "soil moisture temperature humidity crop yield irrigation precision farming agriculture",
    "biometric_auth":       "fingerprint face recognition gait keystroke behavioral biometrics authentication security",
    "environmental":        "weather station rainfall wind speed flood detection climate time series environmental",
    "supply_chain":         "logistics delivery route optimization inventory demand forecasting supply chain",
    "computer_vision":      "object detection bounding box annotation frame label confidence image camera vision",
    "autonomous_vehicle":   "LIDAR camera sensor fusion object detection road driving autonomous vehicle dataset",
}


def _tokenize(text: str) -> list[str]:
    return re.findall(r'[a-z]+', text.lower())


def _tfidf_vector(tokens: list[str], vocab: dict[str, int]) -> list[float]:
    counts: dict[str, int] = {}
    for t in tokens:
        counts[t] = counts.get(t, 0) + 1
    vec = [0.0] * len(vocab)
    for word, idx in vocab.items():
        if word in counts:
            vec[idx] = 1 + math.log(counts[word])
    return vec


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na  = math.sqrt(sum(x * x for x in a))
    nb  = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0


# Build vocabulary and template vectors once at module load (instant, no I/O)
_ALL_TOKENS = []
for text in DOMAIN_TEMPLATES.values():
    _ALL_TOKENS.extend(_tokenize(text))

_VOCAB: dict[str, int] = {w: i for i, w in enumerate(sorted(set(_ALL_TOKENS)))}

_TEMPLATE_VECTORS: dict[str, list[float]] = {
    domain: _tfidf_vector(_tokenize(text), _VOCAB)
    for domain, text in DOMAIN_TEMPLATES.items()
}


async def precompute_domain_embeddings() -> None:
    """No-op — keyword matcher needs no precomputation."""
    logger.info("[Embeddings] Using keyword-based domain matcher — no API calls needed.")


async def get_domain_hints(user_prompt: str, top_k: int = 2) -> list[str]:
    """Return top-k domain names by keyword similarity. Zero API calls."""
    tokens = _tokenize(user_prompt)
    if not tokens:
        return []
    query_vec = _tfidf_vector(tokens, _VOCAB)
    scores = {
        domain: _cosine(query_vec, vec)
        for domain, vec in _TEMPLATE_VECTORS.items()
    }
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    top = [d for d, s in ranked[:top_k] if s > 0]
    logger.info(f"[Embeddings] Domain hints for prompt: {top}")
    return top
