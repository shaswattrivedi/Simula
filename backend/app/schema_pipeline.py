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
import re
from app.llm_client import call_llm, CallType
from app.cache import schema_cache
from app.embeddings import get_domain_hints

logger = logging.getLogger(__name__)


def _raw_preview(raw: object, limit: int = 200) -> str:
    if raw is None:
        return "<none>"
    text = raw if isinstance(raw, str) else str(raw)
    return text[:limit]


def _try_load_json_dict(candidate: object) -> dict | None:
    if not isinstance(candidate, str):
        return None

    text = candidate.strip()
    if not text:
        return None

    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None

    return parsed if isinstance(parsed, dict) else None


def _extract_balanced_json_object(text: str) -> str | None:
    start = text.find("{")
    while start != -1:
        depth = 0
        in_string = False
        escaping = False

        for idx in range(start, len(text)):
            ch = text[idx]

            if in_string:
                if escaping:
                    escaping = False
                elif ch == "\\":
                    escaping = True
                elif ch == '"':
                    in_string = False
                continue

            if ch == '"':
                in_string = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[start:idx + 1]

        start = text.find("{", start + 1)

    return None


def _parse_schema_json(raw: object) -> dict | None:
    parsed = _try_load_json_dict(raw)
    if parsed is not None:
        return parsed

    if not isinstance(raw, str):
        return None

    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL | re.IGNORECASE)
    if fence_match:
        parsed = _try_load_json_dict(fence_match.group(1))
        if parsed is not None:
            return parsed

    balanced = _extract_balanced_json_object(raw)
    if balanced:
        parsed = _try_load_json_dict(balanced)
        if parsed is not None:
            return parsed

    return None


def _safe_int(value: object, default: int, minimum: int | None = None, maximum: int | None = None) -> int:
    try:
        out = int(value)
    except (TypeError, ValueError):
        out = default

    if minimum is not None:
        out = max(minimum, out)
    if maximum is not None:
        out = min(maximum, out)
    return out


def _safe_float(value: object, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _default_columns(data_type: str) -> list[dict]:
    if data_type == "time_series":
        return [
            {
                "name": "timestamp",
                "type": "timestamp",
                "distribution": "uniform",
                "params": {},
                "is_label": False,
                "nullable": False,
                "notes": "Event timestamp",
            },
            {
                "name": "signal_value",
                "type": "float",
                "distribution": "normal",
                "params": {"mean": 0.0, "std": 1.0},
                "is_label": False,
                "nullable": False,
                "notes": "Primary measured signal",
            },
            {
                "name": "anomaly_score",
                "type": "float",
                "distribution": "uniform",
                "params": {"low": 0.0, "high": 1.0},
                "is_label": False,
                "nullable": False,
                "notes": "Model anomaly confidence",
            },
            {
                "name": "label",
                "type": "category",
                "distribution": "categorical",
                "params": {"categories": ["normal", "anomalous"], "weights": [0.9, 0.1]},
                "is_label": True,
                "nullable": False,
                "notes": "Target class",
            },
        ]

    return [
        {
            "name": "feature_1",
            "type": "float",
            "distribution": "normal",
            "params": {"mean": 0.0, "std": 1.0},
            "is_label": False,
            "nullable": False,
            "notes": "Primary numeric feature",
        },
        {
            "name": "feature_2",
            "type": "float",
            "distribution": "normal",
            "params": {"mean": 0.0, "std": 1.0},
            "is_label": False,
            "nullable": False,
            "notes": "Supporting numeric feature",
        },
        {
            "name": "feature_3",
            "type": "int",
            "distribution": "poisson",
            "params": {"lambda": 4},
            "is_label": False,
            "nullable": False,
            "notes": "Count-like feature",
        },
        {
            "name": "label",
            "type": "category",
            "distribution": "categorical",
            "params": {"categories": ["class_a", "class_b"], "weights": [0.5, 0.5]},
            "is_label": True,
            "nullable": False,
            "notes": "Target class",
        },
    ]


def _is_template_schema(schema: dict | None) -> bool:
    if not isinstance(schema, dict):
        return True

    columns = schema.get("columns")
    if not isinstance(columns, list) or not columns:
        return True

    names = [str(c.get("name", "")).strip().lower() for c in columns if isinstance(c, dict)]
    names_set = set(names)

    tabular_template = {"feature_1", "feature_2", "feature_3", "label"}
    time_template = {"timestamp", "signal_value", "anomaly_score", "label"}
    if names_set == tabular_template or names_set == time_template:
        return True

    if len(columns) <= 4 and all(n.startswith("feature_") or n == "label" for n in names if n):
        return True

    schema_name = str(schema.get("schema_name", "")).strip().lower()
    if schema_name in {"generated schema", "dataset schema", "schema"} and len(columns) <= 4:
        return True

    return False


def _normalize_schema(schema: dict | None, data_type_hint: str, original_prompt: str) -> dict:
    allowed_types = {"float", "int", "category", "boolean", "timestamp", "text"}
    default_dist = {
        "float": "normal",
        "int": "poisson",
        "category": "categorical",
        "boolean": "bernoulli",
        "timestamp": "uniform",
        "text": "categorical",
    }

    normalized = dict(schema or {})

    data_type = normalized.get("data_type")
    if not isinstance(data_type, str) or not data_type.strip():
        data_type = data_type_hint or "tabular"
    data_type = data_type.strip()
    if data_type in {"event_log", "text"}:
        # Current generators support tabular and time_series paths only.
        data_type = "tabular"
    if data_type not in {"tabular", "time_series"}:
        data_type = "tabular"

    normalized["data_type"] = data_type
    normalized["schema_name"] = (
        normalized.get("schema_name")
        if isinstance(normalized.get("schema_name"), str) and normalized.get("schema_name").strip()
        else "Generated Schema"
    )
    normalized["description"] = (
        normalized.get("description")
        if isinstance(normalized.get("description"), str) and normalized.get("description").strip()
        else f"Synthetic {data_type} dataset generated from your prompt."
    )
    normalized["recommended_rows"] = _safe_int(
        normalized.get("recommended_rows"),
        1000,
        minimum=100,
        maximum=50000,
    )

    raw_columns = normalized.get("columns")
    if not isinstance(raw_columns, list):
        raw_columns = []

    clean_columns: list[dict] = []
    for idx, col in enumerate(raw_columns):
        if not isinstance(col, dict):
            continue

        name_val = col.get("name")
        name = str(name_val).strip() if name_val is not None else ""
        if not name:
            name = f"feature_{idx + 1}"

        col_type = col.get("type") if isinstance(col.get("type"), str) else "float"
        col_type = col_type.strip().lower()
        if col_type not in allowed_types:
            col_type = "float"

        distribution = col.get("distribution") if isinstance(col.get("distribution"), str) else default_dist[col_type]
        distribution = distribution.strip().lower() if isinstance(distribution, str) else default_dist[col_type]
        if distribution not in {"normal", "uniform", "poisson", "categorical", "bernoulli", "lognormal"}:
            distribution = default_dist[col_type]

        params = col.get("params") if isinstance(col.get("params"), dict) else {}
        params = dict(params)

        if col_type in {"category", "text"}:
            distribution = "categorical"
            categories = params.get("categories")
            if not isinstance(categories, list) or not categories:
                categories = ["option_a", "option_b", "option_c"]
            params["categories"] = [str(c) for c in categories[:10]]

            weights = params.get("weights")
            if isinstance(weights, list) and len(weights) == len(params["categories"]):
                cleaned_weights = []
                for w in weights:
                    cleaned_weights.append(max(0.0, _safe_float(w, 0.0)))
                total = sum(cleaned_weights)
                params["weights"] = (
                    [round(w / total, 6) for w in cleaned_weights]
                    if total > 0
                    else [round(1.0 / len(cleaned_weights), 6)] * len(cleaned_weights)
                )
            else:
                params.pop("weights", None)

        clean_columns.append({
            "name": name,
            "type": col_type,
            "distribution": distribution,
            "params": params,
            "is_label": bool(col.get("is_label", False)),
            "nullable": bool(col.get("nullable", False)),
            "notes": str(col.get("notes", "")).strip(),
        })

    if not clean_columns:
        logger.warning(
            "[Schema] No valid columns produced by model for prompt '%s'. Using deterministic fallback columns.",
            original_prompt[:80],
        )
        clean_columns = _default_columns(data_type)

    label_candidates = [c["name"] for c in clean_columns if c.get("is_label")]
    if not label_candidates:
        clean_columns[-1]["is_label"] = True
        label_candidates = [clean_columns[-1]["name"]]

    normalized["columns"] = clean_columns
    normalized["label_column"] = (
        normalized.get("label_column")
        if isinstance(normalized.get("label_column"), str) and normalized.get("label_column") in {c["name"] for c in clean_columns}
        else label_candidates[0]
    )

    class_balance = normalized.get("class_balance")
    if isinstance(class_balance, dict) and class_balance:
        cleaned_balance: dict[str, float] = {}
        for k, v in class_balance.items():
            cleaned_balance[str(k)] = max(0.0, _safe_float(v, 0.0))
        total = sum(cleaned_balance.values())
        normalized["class_balance"] = (
            {k: round(v / total, 6) for k, v in cleaned_balance.items()}
            if total > 0
            else {}
        )
    else:
        label_col = next((c for c in clean_columns if c["name"] == normalized["label_column"]), None)
        if label_col and label_col.get("distribution") == "categorical":
            categories = label_col.get("params", {}).get("categories", ["class_a", "class_b"])
            p = round(1.0 / max(1, len(categories)), 6)
            normalized["class_balance"] = {str(c): p for c in categories}
        else:
            normalized["class_balance"] = {}

    correlations = normalized.get("correlations")
    normalized["correlations"] = correlations if isinstance(correlations, list) else []

    if data_type == "time_series":
        tc = normalized.get("time_config") if isinstance(normalized.get("time_config"), dict) else {}
        normalized["time_config"] = {
            "frequency_seconds": _safe_int(tc.get("frequency_seconds"), 60, minimum=1),
            "duration_hours": _safe_int(tc.get("duration_hours"), 24, minimum=1),
            "trend": _safe_float(tc.get("trend"), 0.0),
            "noise_std": max(0.0, _safe_float(tc.get("noise_std"), 1.0)),
            "seasonality_period_hours": tc.get("seasonality_period_hours"),
            "events": tc.get("events") if isinstance(tc.get("events"), list) else [],
        }
    else:
        normalized["time_config"] = None

    return normalized

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

SCHEMA_SYSTEM = """You are DataForge's schema architect. Given a project description and domain context, 
generate a complete, realistic dataset schema as JSON.

CRITICAL RULES — violating these makes the schema useless:
1. For categorical columns, you MUST specify real domain-specific category values in params.categories — 
     never use "option_a", "option_b", "option_c" or any generic placeholders.
     Example for sensor_id: {"categories": ["SENSOR_01", "SENSOR_02", "SENSOR_03", "SENSOR_04"]}
     Example for risk_level: {"categories": ["low", "medium", "high", "critical"]}
     Example for compound_name: {"categories": ["Acetaminophen", "Benzene", "Aspirin", "Caffeine", "Ethanol"]}
     Example for location: {"categories": ["entrance", "corridor_A", "hall_B", "exit_gate"]}
2. For timestamp columns, set type to "timestamp" and distribution to "timestamp" — never float.
3. For ID columns like sensor_id or compound_id, use categorical type with realistic ID strings.
4. Value ranges must be realistic for the domain:
     - people_count in a room: 0 to 50, not 0 to 1000000
     - temperature sensor: 15.0 to 45.0 celsius
     - molecular_weight: 50 to 900 g/mol
     - toxicity values: 0.0 to 1.0
     - safety_score: 0.0 to 100.0, mean around 60, std around 20
     - inflow_rate: 0 to 20 people per minute
5. Correlations must reflect real-world relationships:
     - high people_count should correlate with high risk_level
     - inflow and outflow should be moderately correlated
     - molecular_weight and toxicity should have weak positive correlation
6. class_balance must reflect realistic real-world distributions:
     - most crowd scenarios are "safe" 60%, "medium" 30%, "critical" 10%
     - most chemical compounds are non-toxic: "non_toxic" 70%, "toxic" 30%
     - fraud datasets: "normal" 95%, "fraud" 5%

Return ONLY valid JSON in this exact structure:
{
    "schema_name": "descriptive name",
    "data_type": "tabular" | "time_series" | "event_log" | "text",
    "description": "one sentence describing what this dataset represents",
    "recommended_rows": 1000,
    "columns": [
        {
            "name": "column_name",
            "type": "float" | "int" | "category" | "boolean" | "timestamp",
            "distribution": "normal" | "uniform" | "poisson" | "categorical" | "bernoulli" | "lognormal" | "timestamp",
            "params": {},
            "is_label": false,
            "nullable": false,
            "notes": "brief realistic description of what this column represents"
        }
    ],
    "correlations": [
        {"col_a": "column1", "col_b": "column2", "strength": 0.7, "direction": "positive"}
    ],
    "label_column": "column_name",
    "class_balance": {"class_name": 0.6, "class_name2": 0.3, "class_name3": 0.1},
    "time_config": null
}

For time_series data_type, populate time_config:
{
    "frequency_seconds": 5,
    "duration_hours": 24,
    "trend": 0.0,
    "noise_std": 1.0,
    "seasonality_period_hours": null,
    "events": [
        {"name": "surge_event", "probability": 0.02, "signature": "spike", "magnitude": 3.0}
    ]
}

Return ONLY valid JSON. No markdown. No explanation outside the JSON."""

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
    except (json.JSONDecodeError, TypeError):
        logger.error(f"[Schema] Intent parse failed: {_raw_preview(raw)}")
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
    except (json.JSONDecodeError, TypeError):
        logger.error(f"[Schema] Question parse failed: {_raw_preview(raw)}")
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
    except (json.JSONDecodeError, TypeError):
        logger.warning(f"[Schema] Answer parse failed: {_raw_preview(raw)}")
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
        if _is_template_schema(cached):
            logger.warning("[Schema] Cache hit contains generic template schema. Regenerating for richer output.")
        else:
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

    schema = _parse_schema_json(raw)

    if schema is None:
        logger.warning(
            f"[Schema] Primary schema parse failed. Attempting JSON repair. Raw: {_raw_preview(raw, 300)}"
        )

        repair_prompt = (
            "Convert the following content into ONE valid JSON object. "
            "Do not explain anything. Return JSON only.\n\n"
            f"{_raw_preview(raw, 12000)}"
        )
        repair_messages = [
            {
                "role": "system",
                "content": "You are a strict JSON repair assistant. Output only valid JSON object text.",
            },
            {"role": "user", "content": repair_prompt},
        ]
        repaired_raw = await call_llm(
            repair_messages,
            CallType.FALLBACK,
            json_mode=True,
            max_tokens=2200,
        )
        schema = _parse_schema_json(repaired_raw)

    if schema is None:
        logger.warning("[Schema] JSON repair failed. Retrying schema generation with fallback model.")
        fallback_raw = await call_llm(messages, CallType.FALLBACK, json_mode=True, max_tokens=2000)
        schema = _parse_schema_json(fallback_raw)

    if schema is None:
        logger.error(f"[Schema] Fallback schema output not parseable: {_raw_preview(raw, 300)}")
        raise RuntimeError("Schema generation failed — model returned invalid JSON repeatedly.")

    schema = _normalize_schema(schema, data_type, original_prompt)

    if _is_template_schema(schema):
        logger.warning("[Schema] Generic template schema detected. Retrying for prompt-specific columns.")
        specificity_prompt = (
            f"Project description: {original_prompt}\n"
            f"Detected domain: {domain_text}\n"
            f"Data type: {data_type}\n"
            f"User clarifications:\n{answers_text}\n\n"
            "Regenerate a highly specific schema tied to this project.\n"
            "Rules:\n"
            "- Do NOT use placeholder names like feature_1, feature_2, signal_value, anomaly_score, label unless truly required.\n"
            "- Include domain-specific column names and realistic notes.\n"
            "- For tabular, include at least 8 columns. For time_series, include at least 6 columns.\n"
            "- Return ONLY valid JSON matching the requested schema contract."
        )
        specificity_messages = [
            {"role": "system", "content": SCHEMA_SYSTEM},
            {"role": "user", "content": specificity_prompt},
        ]

        specificity_raw = await call_llm(
            specificity_messages,
            CallType.FALLBACK,
            json_mode=True,
            max_tokens=2400,
        )
        specificity_schema = _parse_schema_json(specificity_raw)
        if specificity_schema is not None:
            candidate = _normalize_schema(specificity_schema, data_type, original_prompt)
            if not _is_template_schema(candidate):
                schema = candidate
                logger.info("[Schema] Replaced template schema with prompt-specific regeneration.")

    # Strategy 2: Store in cache
    if _is_template_schema(schema):
        logger.warning("[Schema] Returning template-like schema without caching to allow future regeneration.")
    else:
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
