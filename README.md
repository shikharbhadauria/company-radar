# Company Radar

A full-stack company research tool for software engineers evaluating potential employers. Enter a company name and your profile — get a structured intelligence report with green flags, red flags, and a verdict.

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router, TypeScript) — Vercel (free) |
| Backend | Python FastAPI + LangGraph — Render Web Service (free) |
| LLM | Groq API (`llama-3.3-70b-versatile`) |
| Embeddings | fastembed (`BAAI/bge-small-en-v1.5`, runs inside the backend process) |
| Web Search | SearXNG — Render Python Web Service (free) |
| Web Scraping | Playwright (Chromium) |
| Vector Store | ChromaDB (embedded, persists to `./chroma_data`) |

## How It Works

1. You enter a **company name** and your **profile** (experience, target role, priorities, reason for leaving)
2. The **Planner** generates 11 targeted search queries (site-specific: Glassdoor, AmbitionBox, Reddit, TeamBlind, Levels.fyi, Naukri, etc.)
3. The **Search & Embed** node runs queries via SearXNG, scrapes pages with Playwright, chunks and embeds text with fastembed, and stores results in ChromaDB
4. The **Synthesizer** retrieves the top 20 most relevant chunks via cosine similarity and generates a structured report using Groq
5. If research gaps are detected, the loop runs up to 3 iterations with gap-filling queries
6. The final report streams to the browser with:
   - Company vitals (size, funding, ratings, salaries, remote policy)
   - Green flags with inline citations
   - Red flags with inline citations
   - Verdict: **PURSUE / CAUTION / AVOID**
   - Non-obvious insights

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 18+
- Groq API key — https://console.groq.com

### 1. Start SearXNG

SearXNG runs as a plain Python process — no Docker needed.

```bash
bash searxng/start.sh
```

On first run this clones the SearXNG repo to `/tmp/searxng-local` and installs its dependencies (~2 min). Subsequent runs start instantly. SearXNG will be available at `http://localhost:8080`.

> **Note:** `pip install` of SearXNG fails due to a bug in its `setup.py` (imports `msgspec` before it's installed). The script works around this by cloning the repo and running directly via `PYTHONPATH`.

> **Alternative — Docker:** If you prefer, `docker compose up -d` works the same way and also starts SearXNG on port 8080.

### 2. Configure environment

```bash
cd backend
cp .env.example .env   # add your GROQ_API_KEY

cd ../frontend
cp .env.example .env   # defaults work for local dev
```

### 3. Install Python dependencies

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

The fastembed model (`BAAI/bge-small-en-v1.5`, ~45 MB) downloads automatically on first run.

### 4. Start the backend

```bash
cd backend
source .venv/bin/activate
uvicorn main:server --port 8000 --reload
```

### 5. Install and start the frontend

```bash
cd frontend
npm install
npm run dev
```

### 6. Open http://localhost:3000

---

## Deployment

Production architecture — all free tiers:

```
GitHub (main branch)
  │
  ├── GitHub Actions (CI/CD)
  │     ├── check-backend  (syntax check)
  │     ├── check-frontend (tsc --noEmit)
  │     └── deploy         (triggers Render hooks on pass)
  │
  ├── Render ── company-radar-searxng  (Python web service)
  │         └── company-radar-backend  (Python web service)
  └── Vercel ── company-radar-frontend (auto-deploys on push)
```

### First Deployment — Step by Step

#### Step 1 — Accounts you need

- [Render](https://render.com) account
- [Vercel](https://vercel.com) account
- No CLI needed for anything

---

#### Step 2 — Deploy both Render services via Blueprint

Go to **render.com → New → Blueprint**, connect your GitHub repo. Render reads `render.yaml` and creates both services at once:
- `company-radar-searxng` — runs SearXNG as a Python web service (installed from GitHub, no Docker needed)
- `company-radar-backend` — runs the FastAPI backend

After both are created, set environment variables for each.

**company-radar-searxng → Environment:**

| Variable | Value |
|----------|-------|
| `SEARXNG_SECRET_KEY` | Auto-generated — nothing to do |
| `SEARXNG_BASE_URL` | `https://company-radar-searxng.onrender.com` |

Save and wait for the service to show **Live**. The build installs SearXNG directly from the GitHub source — takes 2–3 minutes.

**company-radar-backend → Environment:**

| Variable | Value |
|----------|-------|
| `GROQ_API_KEY` | Your key from console.groq.com |
| `SEARXNG_URL` | `https://company-radar-searxng.onrender.com/search` |
| `ALLOWED_ORIGINS` | `https://placeholder.vercel.app` (update after step 3) |

Save and wait for **Live**.

---

#### Step 3 — Deploy frontend to Vercel

Go to **vercel.com → New Project → Import Git Repository**. Select your repo.

- Set **Root Directory** to `frontend`
- Add environment variable: `BACKEND_URL` = `https://company-radar-backend.onrender.com`
- Click **Deploy**

Once deployed, copy your Vercel URL (e.g. `https://company-radar-xyz.vercel.app`).

---

#### Step 4 — Update backend CORS with real Vercel URL

Go to **Render → company-radar-backend → Environment**.

Update `ALLOWED_ORIGINS` from the placeholder to your actual Vercel URL. Render redeploys automatically.

---

#### Step 5 — Wire up CI/CD (GitHub Actions)

Get deploy hooks from Render for both services:
- **Render → company-radar-searxng → Settings → Deploy Hook** → copy URL
- **Render → company-radar-backend → Settings → Deploy Hook** → copy URL

Add as GitHub secrets — **repo → Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|--------|-------|
| `RENDER_SEARXNG_DEPLOY_HOOK` | SearXNG deploy hook URL |
| `RENDER_BACKEND_DEPLOY_HOOK` | Backend deploy hook URL |

From now on, every push to `main` runs checks → deploys both Render services if they pass. Vercel deploys the frontend independently in parallel.

---

## Environment Variables

### Backend (set in Render Dashboard)

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq API key for LLM inference |
| `SEARXNG_URL` | Yes | SearXNG search endpoint |
| `ALLOWED_ORIGINS` | Yes | Comma-separated allowed CORS origins |

### Frontend (set in Vercel Dashboard)

| Variable | Required | Description |
|----------|----------|-------------|
| `BACKEND_URL` | Yes | Backend base URL |

### SearXNG (set in Render Dashboard)

| Variable | Required | Description |
|----------|----------|-------------|
| `SEARXNG_SECRET_KEY` | Yes | Auto-generated by `render.yaml` |
| `SEARXNG_BASE_URL` | Yes | Public URL of the SearXNG service |

---

## Notes

- Each research session creates a fresh ChromaDB collection; old collections are cleaned up after 7 days
- SearXNG must be reachable from the backend — if unavailable, search falls back to DuckDuckGo automatically
- The full process takes 2–5 minutes depending on network speed and number of iterations
- fastembed runs inside the backend process — no separate embedding service needed
- SearXNG runs as a plain Python process (no Docker) both locally and on Render — `pip install` fails due to a `setup.py` bug so it's cloned and run via `PYTHONPATH` instead
- Local development: run `bash searxng/start.sh` (clones SearXNG on first run, instant thereafter); Docker still works as an alternative via `docker compose up -d`
