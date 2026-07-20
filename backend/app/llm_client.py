"""
LLM Client — Azure OpenAI primary with Groq fallback
Primary model: gpt-5-mini
Fallback: llama-3.1-8b-instant
"""

import os
import httpx
import logging
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)

# Azure OpenAI Configuration
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT", "").rstrip("/")
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY", "")
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")
PRIMARY_MODEL = os.getenv("AZURE_OPENAI_PRIMARY_MODEL", "gpt-5-mini").strip()

# Groq Fallback Configuration
GROQ_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions"
FALLBACK_MODEL = os.getenv("GROQ_FALLBACK_MODEL", "llama-3.1-8b-instant").strip()

class CallType(str, Enum):
    CHAT     = "chat"
    SCHEMA   = "schema"
    FALLBACK = "fallback"

TIMEOUT_MAP = {
    CallType.CHAT:     20.0,
    CallType.SCHEMA:   60.0,
    CallType.FALLBACK: 20.0,
}

async def call_llm(
    messages: list[dict],
    call_type: CallType = CallType.CHAT,
    json_mode: bool = False,
    max_tokens: int = 2000,
    _retry: bool = True,
) -> str:

    timeout = TIMEOUT_MAP[call_type]
    is_fallback = (call_type == CallType.FALLBACK)

    if not is_fallback:
        if not AZURE_OPENAI_API_KEY or not AZURE_OPENAI_ENDPOINT:
            raise RuntimeError(
                "AZURE_OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT is not set. "
                "Please add them to backend/.env"
            )
        model = PRIMARY_MODEL
        url = f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/{model}/chat/completions?api-version={AZURE_OPENAI_API_VERSION}"
        headers = {
            "api-key": AZURE_OPENAI_API_KEY,
            "Content-Type": "application/json",
        }
    else:
        if not GROQ_KEY:
            raise RuntimeError("GROQ_API_KEY is not set. Add it to backend/.env")
        model = FALLBACK_MODEL
        url = GROQ_BASE
        headers = {
            "Authorization": f"Bearer {GROQ_KEY}",
            "Content-Type": "application/json",
        }

    payload: dict[str, Any] = {
        "messages": messages,
        "max_tokens": max_tokens,
    }
    
    if is_fallback:
        payload["model"] = model

    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, json=payload, headers=headers)

        if resp.status_code >= 400:
            logger.warning(f"[LLM] {model} API error (Status: {resp.status_code}): {resp.text[:200]}")
            if _retry and not is_fallback:
                logger.warning("[LLM] Primary request failed. Falling back to Groq.")
                return await call_llm(messages, CallType.FALLBACK, json_mode, max_tokens, _retry=False)
            resp.raise_for_status()

        data = resp.json()
        return data["choices"][0]["message"]["content"]

    except httpx.TimeoutException:
        logger.warning(f"[LLM] {model} timed out after {timeout}s.")
        if _retry and not is_fallback:
            logger.warning("[LLM] Request timed out. Falling back to Groq.")
            return await call_llm(messages, CallType.FALLBACK, json_mode, max_tokens, _retry=False)
        raise RuntimeError("LLM timed out. Try again.")

    except RuntimeError:
        raise
    except Exception as e:
        logger.error(f"[LLM] Unexpected error with {model}: {e}")
        if _retry and not is_fallback:
            logger.warning("[LLM] Unexpected error. Falling back to Groq.")
            return await call_llm(messages, CallType.FALLBACK, json_mode, max_tokens, _retry=False)
        raise RuntimeError(f"LLM error: {e}")