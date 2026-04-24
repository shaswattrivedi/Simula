"""
LLM Client — Cerebras API
Free tier, no credit card, works in India.
Endpoint is OpenAI-compatible.
Models: llama-3.3-70b (primary), llama-3.1-8b (fallback)
Rate limits: 30 RPM, 900 req/hour free
Get key at: cloud.cerebras.ai
"""

import os
import httpx
import json
import logging
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)

CEREBRAS_BASE = "https://api.cerebras.ai/v1/chat/completions"
CEREBRAS_KEY  = os.getenv("CEREBRAS_API_KEY", "")

class CallType(str, Enum):
    CHAT     = "chat"
    SCHEMA   = "schema"
    FALLBACK = "fallback"

MODEL_MAP = {
    CallType.CHAT:     "llama-3.3-70b",
    CallType.SCHEMA:   "llama-3.3-70b",
    CallType.FALLBACK: "llama-3.1-8b",
}

TIMEOUT_MAP = {
    CallType.CHAT:     20.0,
    CallType.SCHEMA:   60.0,
    CallType.FALLBACK: 20.0,
}


async def call_llm(
    messages: list[dict],
    call_type: CallType = CallType.CHAT,
    json_mode: bool = False,
    max_tokens: int = 1000,
    _retry: bool = True,
) -> str:

    if not CEREBRAS_KEY:
        raise RuntimeError(
            "CEREBRAS_API_KEY is not set. "
            "Get a free key at cloud.cerebras.ai and add it to backend/.env"
        )

    model   = MODEL_MAP[call_type]
    timeout = TIMEOUT_MAP[call_type]

    payload: dict[str, Any] = {
        "model":      model,
        "messages":   messages,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {CEREBRAS_KEY}",
        "Content-Type":  "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(CEREBRAS_BASE, json=payload, headers=headers)

        if resp.status_code == 429:
            logger.warning(f"[LLM] {model} rate-limited (429). Falling back.")
            if _retry and call_type != CallType.FALLBACK:
                return await call_llm(messages, CallType.FALLBACK, json_mode, max_tokens, _retry=False)
            raise RuntimeError("Rate limit hit. Wait 1 minute and retry.")

        if resp.status_code == 503:
            logger.warning(f"[LLM] {model} unavailable (503). Falling back.")
            if _retry and call_type != CallType.FALLBACK:
                return await call_llm(messages, CallType.FALLBACK, json_mode, max_tokens, _retry=False)
            raise RuntimeError("LLM service unavailable. Try again shortly.")

        if resp.status_code == 404:
            logger.error(f"[LLM] Model not found: {model}. Update MODEL_MAP in llm_client.py.")
            raise RuntimeError(f"Model '{model}' not found. Update MODEL_MAP.")

        if resp.status_code in (401, 403):
            raise RuntimeError("Invalid CEREBRAS_API_KEY. Check backend/.env.")

        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]

    except httpx.TimeoutException:
        logger.warning(f"[LLM] {model} timed out after {timeout}s. Falling back.")
        if _retry and call_type != CallType.FALLBACK:
            return await call_llm(messages, CallType.FALLBACK, json_mode, max_tokens, _retry=False)
        raise RuntimeError("LLM timed out. Try again.")

    except RuntimeError:
        raise

    except Exception as e:
        logger.error(f"[LLM] Unexpected error with {model}: {e}")
        if _retry and call_type != CallType.FALLBACK:
            return await call_llm(messages, CallType.FALLBACK, json_mode, max_tokens, _retry=False)
        raise RuntimeError(f"LLM error: {e}")