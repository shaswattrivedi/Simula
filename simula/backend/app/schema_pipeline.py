"""
Schema Intelligence — the core pipeline.

Strategies applied:
  1. COLLAPSED QUESTION LOOP
     Instead of N back-and-forth turns asking one question each,
     DeepSeek Chat receives all missing fields at once and returns
     ALL questions as a JSON array in a single API call.
     User answers everything in one message → one more call to extract answers.
     Total: 2 calls instead of N calls.

  2. SCHEMA CACHE (imported from cache.py)
     Qwen3 schema generation result is cached by prompt+domain hash.
     Cache hit = 0 API calls for the most expensive step.

  3. TEMPLATE-BASED SUMMARY (no LLM call)
     Result summary after scoring uses pre-written templates.
     Eliminates one DeepSeek call per session.

  4. DOMAIN HINTS (from embeddings.py)
     Domain context pre-loaded from HF embeddings.
     Reduces Qwen3 reasoning effort and improves schema quality.
"""

import json
import logging
from app.llm_client import call_llm, CallType
from app.cache import schema_cache
from app.embeddings import get_domain_hints

logger = logging.getLogger(__name__)

# ── SYSTEM PROMPTS ────────────────────────────────────────────────────────────

INTENT_SYSTEM = """You are DataForge's intent classifier. Given a user project description, return ONLY a JSON object:
{
  "mode": "simulate" | "repair" | "augment",
  "confidence": 0.0-1.0,
  "data_type": "tabular" | "time_series" | "event_log" | "text",
  "schema_sufficient": true | false,
  "missing_fields": ["list of field names needed to build schema"]
}
Missing fields can include: row_entity, prediction_target, feature_columns, value_ranges, label_taxonomy, time_frequency, event_types, domain_constraints.
Return ONLY valid JSON. No explanation."""

QUESTION_SYSTEM = """You are DataForge's schema assistant. Given missing schema fields, generate ALL clarifying questions at once as a JSON array. Each question must directly address one missing field.
Return ONLY:
{"questions": [{"field": "field_name", "question": "plain English question for the user"}]}
Maximum 6 questions. Be concise and friendly. No explanation outside JSON."""

SCHEMA_SYSTEM = """You are DataForge's schema architect. Given a project description, domain hints, and user answers, generate a complete dataset schema as JSON:
{
  "schema_name": "descriptive name",
  "data_type": "tabular" | "time_series" | "event_log" | "text",
  "description": "one sentence",
  "recommended_rows": 1000-50000,
  "columns": [
    {
      "name": "column_name",
      "type": "float" | "int" | "category" | "boolean" | "timestamp" | "text",
      "distribution": "normal" | "uniform" | "poisson" | "categorical" | "bernoulli" | "lognormal",
      "params": {},
      "is_label": false,
      "nullable": false,
      "notes": "brief description"
    }
  ],
  "correlations": [{"col_a": "...", "col_b": "...", "strength": 0.0-1.0, "direction": "positive"|"negative"}],
  "label_column": "column_name",
  "class_balance": {"class_name": 0.0},
  "time_config": null
}
For time_series, populate time_config: {"frequency_seconds": int, "duration_hours": int, "trend": float, "noise_std": float, "seasonality_period_hours": null|int, "events": [{"name": "...", "probability": 0.01, "signature": "spike"|"step"|"oscillation", "magnitude": float}]}.
Return ONLY valid JSON. Be specific and realistic for the domain."""

ANSWER_PARSE_SYSTEM = """Extract user answers to schema questions. Return JSON:
{"answers": {"field_name": "user's answer"}}
Map answers to the original field names. Return ONLY valid JSON."""


# ── STRATEGY 3: TEMPLATE-BASED SUMMARY (0 LLM calls) ────────────────────────

def _score_summary(score: float, best_model: str, task_type: str, schema_name: str) -> str:
    if score >= 75:
        quality = "well-structured and highly learnable"
        action  = f"You can proceed directly to training. {best_model} showed the strongest baseline fit."
    elif score >= 55:
        quality = "trainable but has structural gaps"
        action  = f"{best_model} performed best. Consider augmenting minority classes before production training."
    elif score >= 35:
        quality = "usable but needs improvement"
        action  = f"Run the Repair mode on this dataset before training. {best_model} is your best starting point."
    else:
        quality = "too sparse or imbalanced to train reliably"
        action  = "Use Augment mode to expand the dataset, then re-score. The current structure needs more variation."

    return (
        f"Your **{schema_name}** dataset is {quality} for {task_type}. "
        f"{action} Learnability Score: {score:.0f}/100."
    )


# ── MAIN PIPELINE ─────────────────────────────────────────────────────────────

async def classify_intent(user_prompt: str) -> dict:
    """
    Strategy: DeepSeek Chat (1 call).
    Returns intent + schema_sufficient flag + missing_fields list.
    """
    messages = [
        {"role": "system", "content": INTENT_SYSTEM},
        {"role": "user",   "content": user_prompt},
    ]
    raw = await call_llm(messages, CallType.CHAT, json_mode=True, max_tokens=300)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.error(f"[Schema] Intent parse failed: {raw[:200]}")
        return {
            "mode": "simulate", "confidence": 0.5,
            "data_type": "tabular", "schema_sufficient": False,
            "missing_fields": ["row_entity", "prediction_target"]
        }


async def get_all_questions(missing_fields: list[str], domain_hints: list[str]) -> list[dict]:
    """
    Strategy: COLLAPSED LOOP — 1 call returns ALL questions at once.
    Returns list of {field, question} dicts.
    """
    if not missing_fields:
        return []

    domain_ctx = f"Domain context: {', '.join(domain_hints)}. " if domain_hints else ""
    prompt = (
        f"{domain_ctx}Missing schema fields: {', '.join(missing_fields)}. "
        "Generate all clarifying questions at once."
    )
    messages = [
        {"role": "system", "content": QUESTION_SYSTEM},
        {"role": "user",   "content": prompt},
    ]
    raw = await call_llm(messages, CallType.CHAT, json_mode=True, max_tokens=500)
    try:
        data = json.loads(raw)
        return data.get("questions", [])
    except json.JSONDecodeError:
        logger.error(f"[Schema] Question parse failed: {raw[:200]}")
        return [{"field": f, "question": f"Can you describe your {f.replace('_', ' ')}?"} for f in missing_fields]


async def parse_user_answers(
    questions: list[dict],
    user_answer_text: str
) -> dict:
    """
    Strategy: 1 DeepSeek call to extract structured answers from free-text response.
    Maps free text back to field names.
    """
    q_list = "\n".join(f"- {q['field']}: {q['question']}" for q in questions)
    messages = [
        {"role": "system", "content": ANSWER_PARSE_SYSTEM},
        {"role": "user",   "content": f"Questions asked:\n{q_list}\n\nUser answered:\n{user_answer_text}"},
    ]
    raw = await call_llm(messages, CallType.CHAT, json_mode=True, max_tokens=400)
    try:
        return json.loads(raw).get("answers", {})
    except json.JSONDecodeError:
        return {}


async def generate_schema(
    original_prompt: str,
    domain_hints: list[str],
    user_answers: dict,
    data_type: str,
) -> dict:
    """
    Strategy: CACHE CHECK FIRST — if cache hit, 0 API calls.
    On miss: Qwen3-235B (1 call) + cache the result.
    """
    # Strategy 2: Check cache before calling Qwen3
    cached = schema_cache.get(original_prompt, domain_hints)
    if cached:
        logger.info("[Schema] Cache hit — skipping Qwen3 call.")
        return cached

    # Build rich context for Qwen3
    answers_text = "\n".join(f"  {k}: {v}" for k, v in user_answers.items()) if user_answers else "  (none)"
    domain_text  = ", ".join(domain_hints) if domain_hints else "general"

    prompt = (
        f"Project description: {original_prompt}\n"
        f"Detected domain: {domain_text}\n"
        f"Data type: {data_type}\n"
        f"User clarifications:\n{answers_text}\n\n"
        "Generate a complete, realistic dataset schema for this project."
    )
    messages = [
        {"role": "system", "content": SCHEMA_SYSTEM},
        {"role": "user",   "content": prompt},
    ]
    raw = await call_llm(messages, CallType.SCHEMA, json_mode=True, max_tokens=2000)

    try:
        schema = json.loads(raw)
    except json.JSONDecodeError:
        # Try to extract JSON from response if wrapped in markdown
        import re
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            schema = json.loads(match.group())
        else:
            logger.error(f"[Schema] Qwen3 output not parseable: {raw[:300]}")
            raise ValueError("Schema generation failed — model returned non-JSON output.")

    # Strategy 2: Store in cache
    schema_cache.set(original_prompt, domain_hints, schema)
    return schema


# ── FULL SESSION ORCHESTRATOR ─────────────────────────────────────────────────

async def run_schema_pipeline(
    user_prompt: str,
    user_answers_text: str | None = None,
    prior_questions: list[dict] | None = None,
) -> dict:
    """
    Orchestrates the full schema pipeline with all strategies applied.

    Returns a dict with:
      - stage: "questions_needed" | "schema_ready"
      - questions: list[dict]  (if stage == questions_needed)
      - schema: dict           (if stage == schema_ready)
      - domain_hints: list[str]
      - api_calls_made: int    (for transparency/debugging)

    Call count tracking:
      HF embed:   1 (always — but no credit cost)
      DeepSeek:   1 (intent) + 1 (questions, if needed) + 1 (answer parse, if needed)
      Qwen3:      0-1 (0 on cache hit, 1 on miss)
      TOTAL:      2-4 calls per full session (down from ~6 baseline)
    """
    api_calls = 0

    # Step 1: HF embedding — 1 call, no credit consumption
    domain_hints = await get_domain_hints(user_prompt)
    # Note: HF CPU embedding does NOT count against OpenRouter budget

    # Step 2: Intent classification — 1 DeepSeek call
    intent = await classify_intent(user_prompt)
    api_calls += 1
    logger.info(f"[Pipeline] Intent: {intent}")

    # Step 3a: If schema is sufficient → go straight to Qwen3
    if intent["schema_sufficient"] and not prior_questions:
        schema = await generate_schema(
            user_prompt, domain_hints, {}, intent["data_type"]
        )
        # Qwen3 call only if cache miss
        api_calls += 0 if schema_cache.get(user_prompt, domain_hints) else 1
        return {
            "stage": "schema_ready",
            "schema": schema,
            "domain_hints": domain_hints,
            "mode": intent["mode"],
            "api_calls_made": api_calls,
        }

    # Step 3b: Questions needed — collapsed loop, 1 DeepSeek call
    if not user_answers_text:
        questions = await get_all_questions(intent["missing_fields"], domain_hints)
        api_calls += 1
        return {
            "stage": "questions_needed",
            "questions": questions,
            "domain_hints": domain_hints,
            "mode": intent["mode"],
            "api_calls_made": api_calls,
        }

    # Step 4: Parse answers — 1 DeepSeek call
    answers = await parse_user_answers(prior_questions or [], user_answers_text)
    api_calls += 1

    # Step 5: Schema generation — 0-1 Qwen3 calls (cache-aware)
    schema = await generate_schema(
        user_prompt, domain_hints, answers, intent["data_type"]
    )
    is_cache_hit = schema_cache.get(user_prompt, domain_hints) is not None
    api_calls += 0 if is_cache_hit else 1

    return {
        "stage": "schema_ready",
        "schema": schema,
        "domain_hints": domain_hints,
        "mode": intent["mode"],
        "api_calls_made": api_calls,
    }


def build_result_summary(score: float, best_model: str, task_type: str, schema_name: str) -> str:
    """
    Strategy 3: Template-based summary — 0 LLM calls.
    Called after learnability scoring to explain results to the user.
    """
    return _score_summary(score, best_model, task_type, schema_name)
