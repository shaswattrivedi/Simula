"""
LLM Client — Cerebras API
Free tier, no credit card, works in India.
Endpoint is OpenAI-compatible.
Models: llama3.1-8b (primary), llama3.1-8b (fallback)
Rate limits: 30 RPM, 900 req/hour free
Get key at: cloud.cerebras.ai
"""

import os
import httpx
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


PRIMARY_MODEL = os.getenv("CEREBRAS_PRIMARY_MODEL", "llama3.1-8b").strip() or "llama3.1-8b"
FALLBACK_MODEL = os.getenv("CEREBRAS_FALLBACK_MODEL", "llama3.1-8b").strip() or "llama3.1-8b"

MODEL_MAP = {
    CallType.CHAT:     PRIMARY_MODEL,
    CallType.SCHEMA:   PRIMARY_MODEL,
    CallType.FALLBACK: FALLBACK_MODEL,
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

        err_code = ""
        err_msg = ""
        if resp.status_code >= 400:
            try:
                err = resp.json()
                err_code = str(err.get("code", "")).lower()
                err_msg = str(err.get("message", ""))
            except Exception:
                err_code = ""
                err_msg = resp.text[:200]

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

        is_model_error = (
            err_code == "model_not_found"
            or "model" in err_msg.lower()
            and (
                "does not exist" in err_msg.lower()
                or "do not have access" in err_msg.lower()
                or "not found" in err_msg.lower()
            )
        )

        if resp.status_code in (400, 403, 404) and is_model_error:
            logger.warning(f"[LLM] Model unavailable/inaccessible: {model}. Falling back.")
            if _retry and call_type != CallType.FALLBACK:
                return await call_llm(messages, CallType.FALLBACK, json_mode, max_tokens, _retry=False)
            raise RuntimeError(
                "Configured Cerebras models are unavailable for this key. "
                "Set CEREBRAS_PRIMARY_MODEL/CEREBRAS_FALLBACK_MODEL in backend/.env."
            )

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