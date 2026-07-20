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
    "e_commerce":           "ecommerce retail shopping cart customer purchase history churn recommendation cart abandonment sales",
    "healthcare":           "patient medical records diagnosis disease hospital length of stay clinical notes health insurance",
    "finance":              "credit card fraud detection financial transaction credit scoring loan default risk finance banking",
    "cybersecurity":        "network intrusion detection malware anomaly traffic ddos attack botnet cybersecurity firewall",
    "natural_language":     "text classification sentiment analysis NLP document labeling customer review chatbot language",
    "computer_vision":      "image classification object detection bounding box semantic segmentation camera visual recognition",
    "manufacturing":        "predictive maintenance factory sensor equipment failure industrial iot defect detection production",
    "human_resources":      "employee performance attrition prediction candidate screening hr retention recruiting salary",
    "logistics":            "supply chain delivery route optimization inventory demand forecasting logistics shipping transport",
    "energy":               "smart grid electricity consumption power demand forecasting renewable energy solar wind grid",
    "real_estate":          "property valuation real estate pricing housing market rent prediction building occupancy",
    "telecommunications":   "customer churn prediction network latency bandwidth usage telco 5g mobile data telecommunications",
    "agriculture":          "crop yield prediction precision farming weather impact agricultural soil quality yield analysis",
    "social_media":         "user engagement virality prediction social network sentiment analysis post reach likes shares",
    "education":            "student performance prediction dropout prevention exam score grading e-learning education",
    "streaming_service":    "user retention content recommendation watching habits viewership tracking media streaming"
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
