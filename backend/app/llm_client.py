"""
LLM Client — OpenRouter model routing with fallback chain.

Model assignment per call type:
  chat / intent / questions  → DeepSeek Chat v3   (fast, tool-calling)
  schema_generation          → Qwen3-235B         (deep reasoning)
  fallback (any)             → Llama-4-Maverick   (1M ctx, no rate risk)

Strategies applied:
  - Per-call model selection (never use heavy model for light tasks)
  - Automatic 429 / 503 fallback to Llama
  - Timeout per call type (chat=8s, schema=25s)
  - Structured JSON output enforced via system prompt
"""

import os
import httpx
import json
import asyncio
import logging
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)

OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_KEY  = os.getenv("OPENROUTER_API_KEY", "")

class CallType(str, Enum):
    CHAT     = "chat"       # intent classification, question generation
    SCHEMA   = "schema"     # schema generation — Qwen3 only
    FALLBACK = "fallback"   # forced Llama path

MODEL_MAP = {
    CallType.CHAT:     "deepseek/deepseek-chat-v3-0324:free",
    CallType.SCHEMA:   "qwen/qwen3-235b-a22b:free",
    CallType.FALLBACK: "meta-llama/llama-4-maverick:free",
}

TIMEOUT_MAP = {
    CallType.CHAT:     10.0,
    CallType.SCHEMA:   30.0,
    CallType.FALLBACK: 15.0,
}


async def call_llm(
    messages: list[dict],
    call_type: CallType = CallType.CHAT,
    json_mode: bool = False,
    max_tokens: int = 1000,
    _retry: bool = True,
) -> str:
    """
    Single entry point for all OpenRouter calls.
    Returns the assistant message content as a string.
    Automatically falls back to Llama on 429/503/timeout.
    """
    model   = MODEL_MAP[call_type]
    timeout = TIMEOUT_MAP[call_type]

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {OPENROUTER_KEY}",
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://dataforge.app",
        "X-Title":       "DataForge",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(OPENROUTER_BASE, json=payload, headers=headers)

        if resp.status_code == 429 or resp.status_code == 503:
            logger.warning(f"[LLM] {model} rate-limited ({resp.status_code}). Falling back.")
            if _retry and call_type != CallType.FALLBACK:
                return await call_llm(messages, CallType.FALLBACK, json_mode, max_tokens, _retry=False)
            raise RuntimeError(f"Rate limit on fallback model: {resp.status_code}")

        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]

    except httpx.TimeoutException:
        logger.warning(f"[LLM] {model} timed out after {timeout}s. Falling back.")
        if _retry and call_type != CallType.FALLBACK:
            return await call_llm(messages, CallType.FALLBACK, json_mode, max_tokens, _retry=False)
        raise RuntimeError("All models timed out.")

    except Exception as e:
        logger.error(f"[LLM] Unexpected error with {model}: {e}")
        if _retry and call_type != CallType.FALLBACK:
            return await call_llm(messages, CallType.FALLBACK, json_mode, max_tokens, _retry=False)
        raise
