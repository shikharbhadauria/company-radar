# Company Radar

A full-stack company research tool for software engineers evaluating potential employers. Enter a company name and your profile — get a structured intelligence report with green flags, red flags, and a verdict.

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router, TypeScript) — Vercel (free) |
| Backend | Python FastAPI + LangGraph — Render Web Service (free) |
| LLM | Groq API (`openai/gpt-oss-120b`) |
| Embeddings | fastembed (`BAAI/bge-small-en-v1.5`, runs inside the backend process) |
| Web Search | Tavily Search API (hosted, free tier) |
| Web Scraping | httpx (async HTTP, no browser) |
| Vector Store | ChromaDB (embedded, persists to `./chroma_data`) |

> **Why Tavily?** Search engines block cloud IPs (Render, AWS, GCP), so a self-hosted SearXNG on Render returns nothing. Tavily is a hosted search API built for LLM agents — it works from any server with no extra infrastructure to keep running.

## How It Works

1. You enter a **company name** and your **profile** (experience, target role, priorities, reason for leaving)
2. The **Planner** generates 11 targeted search queries (site-specific: Glassdoor, AmbitionBox, Reddit, TeamBlind, Levels.fyi, Naukri, etc.)
3. The **Search & Embed** node runs queries via the Tavily API, scrapes pages with httpx, chunks and embeds text with fastembed, and stores results in ChromaDB
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
- Tavily API key — https://app.tavily.com

### 1. Configure environment

```bash
cd backend
cp .env.example .env   # add your GROQ_API_KEY and TAVILY_API_KEY

cd ../frontend
cp .env.example .env   # defaults work for local dev
```

### 2. Install Python dependencies

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

The fastembed model (`BAAI/bge-small-en-v1.5`, ~45 MB) downloads automatically on first run.

### 3. Start the backend

```bash
cd backend
source .venv/bin/activate
uvicorn main:server --port 8000 --reload
```

### 4. Install and start the frontend

```bash
cd frontend
npm install
npm run dev
```

### 5. Open http://localhost:3000

---

## Deployment

Production architecture:

```
GitHub (main branch)
  │
  ├── GitHub Actions (CI)
  │     ├── check-backend  (syntax check)
  │     └── check-frontend (tsc --noEmit)
  │
  ├── Render ── company-radar-backend ──▶ Tavily API for searches
  └── Vercel ── company-radar-frontend (auto-deploys on push)
```

### First Deployment — Step by Step

#### Step 1 — Accounts you need

- [Render](https://render.com) account
- [Vercel](https://vercel.com) account
- [Tavily](https://app.tavily.com) account (API key for web search)

---

#### Step 2 — Deploy backend to Render

Go to **render.com → New → Web Service**, connect your GitHub repo.

- Set **Language** to `Python`
- Set **Root Directory** to `backend`
- Set **Build Command** to:
  ```
  pip install -r requirements.txt
  ```
- Set **Start Command** to:
  ```
  uvicorn main:server --host 0.0.0.0 --port $PORT
  ```

Set environment variables:

| Variable | Value |
|----------|-------|
| `GROQ_API_KEY` | Your key from console.groq.com |
| `TAVILY_API_KEY` | Your key from app.tavily.com |
| `ALLOWED_ORIGINS` | `https://placeholder.vercel.app` (update after step 3) |

Save and wait for **Live**.

---

#### Step 3 — Deploy frontend to Vercel

Go to **vercel.com → New Project → Import Git Repository**. Select your repo.

- Set **Root Directory** to `frontend`
- Add environment variable: `BACKEND_URL` = `https://your-backend.onrender.com`
- Click **Deploy**

Once deployed, copy your Vercel URL (e.g. `https://company-radar-xyz.vercel.app`).

---

#### Step 4 — Update backend CORS with real Vercel URL

Go to **Render → your backend service → Environment**.

Update `ALLOWED_ORIGINS` from the placeholder to your actual Vercel URL. Render redeploys automatically.

---

#### Step 5 — Wire up CI/CD (GitHub Actions)

Get the deploy hook from Render:
- **Render → your backend → Settings → Deploy Hook** → copy URL

Add as a GitHub secret — **repo → Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|--------|-------|
| `RENDER_BACKEND_DEPLOY_HOOK` | Backend deploy hook URL |

From now on, every push to `main` runs checks → deploys the backend if they pass. Vercel deploys the frontend independently in parallel.

---

## Environment Variables

### Backend (set in Render Dashboard)

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq API key for LLM inference |
| `TAVILY_API_KEY` | Yes | Tavily API key for web search |
| `ALLOWED_ORIGINS` | Yes | Comma-separated allowed CORS origins (your Vercel URL) |

### Frontend (set in Vercel Dashboard)

| Variable | Required | Description |
|----------|----------|-------------|
| `BACKEND_URL` | Yes | Backend base URL (your Render service URL) |

---

## Notes

- Each research session creates a fresh ChromaDB collection; old collections are cleaned up after 7 days
- Each research run makes up to ~33 Tavily searches (11 queries × up to 3 iterations) — keep this in mind against the free-tier monthly quota
- The full research process takes 2–5 minutes depending on network speed and number of iterations
- fastembed runs inside the backend process — no separate embedding service needed
- Web scraping uses httpx (pure HTTP, no browser) — faster, lower memory, and no Chrome crashes on cloud free tiers; JavaScript-rendered content is not needed since review sites serve enough content in their initial HTML
