"""
Schema Cache — hash-based in-memory cache for Qwen3 schema generation.

Strategy applied:
  - MD5 of (normalized_prompt + domain_hints) as cache key
  - Two users with identical/near-identical project descriptions
    share one Qwen3 call — eliminates the most expensive API call
  - TTL of 24 hours (schemas don't change between sessions)
  - Max 500 entries (LRU eviction via ordered dict)

In Phase 2 this swaps to Redis with zero API changes.
"""

import hashlib
import json
import time
import logging
from collections import OrderedDict

logger = logging.getLogger(__name__)

_CACHE_MAX  = 500
_CACHE_TTL  = 86400  # 24 hours in seconds

class SchemaCache:
    def __init__(self):
        self._store: OrderedDict[str, dict] = OrderedDict()

    def _key(self, prompt: str, domain_hints: list[str]) -> str:
        normalized = prompt.lower().strip()
        payload    = normalized + "|" + ",".join(sorted(domain_hints))
        return hashlib.md5(payload.encode()).hexdigest()

    def get(self, prompt: str, domain_hints: list[str]) -> dict | None:
        key = self._key(prompt, domain_hints)
        entry = self._store.get(key)
        if entry is None:
            return None
        if time.time() - entry["ts"] > _CACHE_TTL:
            del self._store[key]
            return None
        # Move to end (most recently used)
        self._store.move_to_end(key)
        logger.info(f"[Cache] HIT — key {key[:8]}…")
        return entry["schema"]

    def set(self, prompt: str, domain_hints: list[str], schema: dict) -> None:
        key = self._key(prompt, domain_hints)
        if len(self._store) >= _CACHE_MAX:
            evicted = next(iter(self._store))
            del self._store[evicted]
            logger.debug(f"[Cache] Evicted LRU entry {evicted[:8]}…")
        self._store[key] = {"schema": schema, "ts": time.time()}
        logger.info(f"[Cache] SET — key {key[:8]}… ({len(self._store)}/{_CACHE_MAX} entries)")

    def stats(self) -> dict:
        return {"entries": len(self._store), "max": _CACHE_MAX, "ttl_hours": _CACHE_TTL / 3600}


# Singleton — imported by all routes
schema_cache = SchemaCache()
