# Simula

> Generate AI training datasets from zero — no existing data required.

## Structure

```
simula/
  frontend/          React + Vite chat interface
  backend/           FastAPI data generation engine
  package.json       Root scripts
```

## Local setup (10 minutes)

### 1. Clone and install frontend
```bash
cd frontend
npm install
```

### 2. Set up backend
```bash
cd backend
pip install -r requirements.txt
cp .env.template .env
```

Edit `.env` and add your keys:
```
OPENROUTER_API_KEY=your_key_here
HUGGINGFACE_TOKEN=your_token_here
```

### 3. Run both together

Terminal 1 (backend):
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Terminal 2 (frontend):
```bash
cd frontend
npm run dev
```

Open http://localhost:3000

---

## Get your API keys

**OpenRouter** (https://openrouter.ai)
1. Create account
2. Add $10 credit top-up (Settings → Credits) — unlocks 1,000 req/day
3. Create API key (Settings → API Keys)

**HuggingFace** (https://huggingface.co)
1. Create account
2. Settings → Access Tokens → New token
3. Select "Make calls to Inference Providers" permission

---

## Deploy

**Backend → Render**
1. Push repo to GitHub
2. New Web Service → connect repo → set root to `/backend`
3. Build: `pip install -r requirements.txt`
4. Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add env vars: OPENROUTER_API_KEY, HUGGINGFACE_TOKEN

**Frontend → Vercel**
1. New Project → connect repo → set root to `/frontend`
2. Add env var: `VITE_API_URL=https://your-backend.onrender.com`
3. Deploy

**Keep-alive**
- UptimeRobot (free) → HTTP monitor → your Render URL + `/health` → every 5 min
- Prevents Render cold starts

---

## API call budget per session

| Step | Service | Calls |
|---|---|---|
| Domain matching | HuggingFace CPU | 1 (no credit cost) |
| Intent + questions | OpenRouter DeepSeek | 1–2 |
| Schema generation | OpenRouter Qwen3 | 0 (cache) or 1 |
| Summary | Template | 0 |
| **Total** | | **2–4 per session** |

$10 top-up → ~250–500 sessions/day at 1,000 req/day limit.
