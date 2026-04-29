# Company Radar

A full-stack company research tool for software engineers evaluating potential employers. Enter a company name and your profile — get a structured intelligence report with green flags, red flags, and a verdict.

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router, TypeScript) — Vercel (free) |
| Backend | Python FastAPI + LangGraph — Render Web Service (free) |
| LLM | Groq API (`llama-3.3-70b-versatile`) |
| Embeddings | fastembed (`BAAI/bge-small-en-v1.5`, runs inside the backend process) |
| Web Search | SearXNG — Fly.io Docker App (free) |
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

- Docker (for running SearXNG locally)
- Python 3.11+
- Node.js 18+
- Groq API key — https://console.groq.com

### 1. Start SearXNG

```bash
docker compose up -d
```

SearXNG will be available at `http://localhost:8080`.

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
  │     ├── deploy-searxng (Fly.io — on pass)
  │     └── deploy-backend (Render — on pass)
  │
  ├── Fly.io   ── company-radar-searxng  (Docker app)
  ├── Render   ── company-radar-backend  (Python web service)
  └── Vercel   ── company-radar-frontend (auto-deploys on push)
```

### First Deployment — Step by Step

#### Step 1 — Accounts and tools you need

- [Render](https://render.com) account
- [Fly.io](https://fly.io) account
- [Vercel](https://vercel.com) account
- Fly.io CLI installed:
  ```bash
  brew install flyctl   # macOS
  # or: curl -L https://fly.io/install.sh | sh
  ```

---

#### Step 2 — Deploy SearXNG to Fly.io

This is a one-time setup from your machine.

```bash
# Login
fly auth login

# Create the app (pick a unique name — it becomes part of the URL)
fly apps create company-radar-searxng

# Set the secret key (Fly.io stores this securely, never in your code)
fly secrets set SEARXNG_SECRET_KEY=$(openssl rand -hex 32) --app company-radar-searxng

# Deploy
fly deploy --config searxng/fly.toml
```

After deploy, your SearXNG URL is `https://company-radar-searxng.fly.dev`.

If you chose a different app name, update `app` and `SEARXNG_BASE_URL` in `searxng/fly.toml` to match before deploying.

---

#### Step 3 — Deploy backend to Render

Go to **render.com → New → Blueprint**, connect your GitHub repo. Render reads `render.yaml` and creates the backend service.

Then go to **company-radar-backend → Environment** and set:

| Variable | Value |
|----------|-------|
| `GROQ_API_KEY` | Your key from console.groq.com |
| `SEARXNG_URL` | `https://company-radar-searxng.fly.dev/search` |
| `ALLOWED_ORIGINS` | `https://placeholder.vercel.app` (update after step 4) |

Save and wait for the service to show **Live**.

---

#### Step 4 — Deploy frontend to Vercel

Go to **vercel.com → New Project → Import Git Repository**. Select your repo.

- Set **Root Directory** to `frontend`
- Add environment variable: `BACKEND_URL` = `https://company-radar-backend.onrender.com`
- Click **Deploy**

Once deployed, copy your Vercel URL (e.g. `https://company-radar-xyz.vercel.app`).

---

#### Step 5 — Update backend CORS

Go back to **Render → company-radar-backend → Environment**.

Update `ALLOWED_ORIGINS` from the placeholder to your real Vercel URL. Render redeploys automatically.

---

#### Step 6 — Wire up CI/CD (GitHub Actions)

Get the backend deploy hook from Render:
- **Render → company-radar-backend → Settings → Deploy Hook** → copy the URL

Get your Fly.io API token:
- **fly.io dashboard → Account → Access Tokens → Create token** (or run `fly auth token`)

Add both as GitHub secrets:
- **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|--------|-------|
| `RENDER_BACKEND_DEPLOY_HOOK` | The URL from Render |
| `FLY_API_TOKEN` | Your Fly.io token |

From now on, every push to `main` runs checks → deploys both services if they pass. Vercel deploys the frontend independently in parallel.

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

### SearXNG (set via `fly secrets set`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SEARXNG_SECRET_KEY` | Yes | Signs session cookies — set once, never changes |

---

## Notes

- Each research session creates a fresh ChromaDB collection; old collections are cleaned up after 7 days
- SearXNG must be reachable from the backend — if unavailable, search falls back to DuckDuckGo automatically
- The full process takes 2–5 minutes depending on network speed and number of iterations
- fastembed runs inside the backend process — no separate embedding service needed
- Local development still uses Docker for SearXNG via `docker compose up -d`
- Fly.io free tier includes 3 shared-CPU VMs — SearXNG fits comfortably within this
