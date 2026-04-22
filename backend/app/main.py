"""
DataForge FastAPI Backend — Phase 1

All 5 strategies integrated:
  1. Hash-based schema cache         → cache.py
  2. Collapsed question loop          → schema_pipeline.py
  3. Pre-computed domain embeddings   → embeddings.py (startup event)
  4. Template-based result summary    → schema_pipeline.py
  5. Model routing + fallback chain   → llm_client.py

Endpoints:
  GET  /health                   → server health + cache stats
  POST /api/chat                 → full schema pipeline (all strategies active)
  POST /api/schema/confirm       → user confirms/edits schema card
  POST /api/generate             → data generation from confirmed schema
  POST /api/repair               → repair uploaded CSV
  GET  /api/cache/stats          → cache hit/miss stats (debug)
"""

import logging
import io
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.embeddings import precompute_domain_embeddings
from app.schema_pipeline import run_schema_pipeline, build_result_summary
from app.cache import schema_cache

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger(__name__)


# ── STARTUP ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Strategy 4 activation: pre-compute all 20 domain embeddings at startup.
    20 HF API calls — runs ONCE, result saved to domain_embeddings.json.
    Subsequent restarts skip this entirely if the file exists.
    """
    logger.info("[Startup] Precomputing domain embeddings…")
    await precompute_domain_embeddings()
    logger.info("[Startup] Ready.")
    yield


app = FastAPI(
    title="DataForge API",
    version="1.0.0-phase1",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten to your Vercel domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── REQUEST / RESPONSE MODELS ─────────────────────────────────────────────────

class ChatRequest(BaseModel):
    prompt: str
    user_answers: str | None = None
    prior_questions: list[dict] | None = None

class ConfirmSchemaRequest(BaseModel):
    schema: dict               # Confirmed (possibly edited) schema from frontend card
    original_prompt: str

class GenerateRequest(BaseModel):
    schema: dict
    row_count: int | None = None   # Override recommended_rows if provided

class ChatResponse(BaseModel):
    stage: str                     # "questions_needed" | "schema_ready"
    questions: list[dict] | None = None
    schema: dict | None = None
    domain_hints: list[str] = []
    mode: str = "simulate"
    api_calls_made: int = 0
    message: str = ""


# ── ENDPOINTS ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Keep-alive endpoint. Also hit by UptimeRobot every 5 minutes."""
    return {
        "status": "ok",
        "version": "1.0.0-phase1",
        "cache": schema_cache.stats(),
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """
    Main entry point. Runs the full schema pipeline with all strategies.

    Strategy summary per call:
      - HF embed: always 1 (no credit cost)
      - DeepSeek: 1–3 depending on whether questions are needed
      - Qwen3: 0 (cache hit) or 1 (cache miss)
      - Total OpenRouter calls: 1–4 per full session
    """
    if not req.prompt or len(req.prompt.strip()) < 5:
        raise HTTPException(status_code=400, detail="Prompt too short — describe your project.")

    result = await run_schema_pipeline(
        user_prompt=req.prompt.strip(),
        user_answers_text=req.user_answers,
        prior_questions=req.prior_questions,
    )

    if result["stage"] == "questions_needed":
        return ChatResponse(
            stage="questions_needed",
            questions=result["questions"],
            domain_hints=result["domain_hints"],
            mode=result["mode"],
            api_calls_made=result["api_calls_made"],
            message=(
                "I need a few details to build your schema. "
                "Answer all questions below and I'll generate your dataset."
            ),
        )

    return ChatResponse(
        stage="schema_ready",
        schema=result["schema"],
        domain_hints=result["domain_hints"],
        mode=result["mode"],
        api_calls_made=result["api_calls_made"],
        message=(
            "Here's your proposed schema. Review the columns, types, and distributions — "
            "edit anything that doesn't match your project, then confirm to generate."
        ),
    )


@app.post("/api/schema/confirm")
async def confirm_schema(req: ConfirmSchemaRequest):
    """
    User has reviewed and optionally edited the schema card.
    Update cache with the confirmed schema so future similar prompts benefit.
    Returns the confirmed schema back for the generation step.
    """
    # Re-cache with confirmed (possibly edited) schema
    schema_cache.set(req.original_prompt, [], req.schema)
    logger.info(f"[API] Schema confirmed and cached for prompt: {req.original_prompt[:60]}…")
    return {"status": "confirmed", "schema": req.schema}


@app.post("/api/generate")
async def generate(req: GenerateRequest):
    """
    Generate dataset from confirmed schema.
    Returns CSV as a streaming download — no file stored on server.

    Data generation is pure Python (pandas + scipy + numpy).
    Zero LLM API calls in this endpoint.
    """
    from app.generators.tabular import generate_tabular
    from app.generators.timeseries import generate_timeseries

    schema    = req.schema
    data_type = schema.get("data_type", "tabular")
    row_count = req.row_count or schema.get("recommended_rows", 1000)
    row_count = min(row_count, 50_000)  # Hard cap — Render free tier memory limit

    try:
        if data_type == "time_series":
            df = generate_timeseries(schema, row_count)
        else:
            df = generate_tabular(schema, row_count)
    except Exception as e:
        logger.error(f"[Generate] Failed: {e}")
        raise HTTPException(status_code=500, detail=f"Dataset generation failed: {str(e)}")

    # Stream CSV directly — no disk write, no storage cost
    csv_buffer = io.StringIO()
    df.to_csv(csv_buffer, index=False)
    csv_buffer.seek(0)

    filename = schema.get("schema_name", "dataforge_dataset").replace(" ", "_").lower() + ".csv"
    return StreamingResponse(
        iter([csv_buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.post("/api/repair")
async def repair(file: UploadFile = File(...)):
    """
    Repair uploaded CSV: NaN imputation, class balance, outlier clipping.
    Zero LLM calls — pure Python (pandas + scikit-learn + imbalanced-learn).
    Returns repaired CSV + before/after diagnosis report.
    """
    from app.repair import run_repair

    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files accepted.")

    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:  # 50MB cap
        raise HTTPException(status_code=413, detail="File too large. Maximum 50MB.")

    try:
        repaired_df, report = run_repair(contents)
    except Exception as e:
        logger.error(f"[Repair] Failed: {e}")
        raise HTTPException(status_code=500, detail=f"Repair failed: {str(e)}")

    csv_buffer = io.StringIO()
    repaired_df.to_csv(csv_buffer, index=False)
    csv_buffer.seek(0)

    base_name = file.filename.replace(".csv", "_repaired.csv")
    return StreamingResponse(
        iter([csv_buffer.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={base_name}",
            "X-Repair-Report":     json.dumps(report),  # Report in header for frontend
        },
    )


@app.post("/api/score")
async def score_dataset(req: GenerateRequest):
    """
    Run learnability scoring on a generated dataset.
    Strategy 3: summary generated via template (0 LLM calls).
    """
    from app.generators.tabular import generate_tabular
    from app.generators.timeseries import generate_timeseries
    from app.scoring import run_scoring

    schema    = req.schema
    data_type = schema.get("data_type", "tabular")
    row_count = min(req.row_count or schema.get("recommended_rows", 1000), 50_000)

    try:
        df = generate_timeseries(schema, row_count) if data_type == "time_series" else generate_tabular(schema, row_count)
        scoring_result = run_scoring(df, schema)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scoring failed: {str(e)}")

    # Strategy 3: Template summary — 0 LLM calls
    summary = build_result_summary(
        score=scoring_result["learnability_score"],
        best_model=scoring_result["best_model"],
        task_type=scoring_result["task_type"],
        schema_name=schema.get("schema_name", "dataset"),
    )

    return {**scoring_result, "summary": summary}


@app.get("/api/cache/stats")
async def cache_stats():
    """Debug endpoint — shows cache utilization."""
    return schema_cache.stats()
