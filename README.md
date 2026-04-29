# Company Radar

A full-stack company research tool for software engineers evaluating potential employers. Enter a company name and your profile — get a structured intelligence report with green flags, red flags, and a verdict.

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router, TypeScript) — Vercel |
| Backend | Python FastAPI + LangGraph — Render |
| LLM | Groq API (`llama-3.3-70b-versatile`) |
| Embeddings | fastembed (`BAAI/bge-small-en-v1.5`, runs locally in the backend process) |
| Web Search | SearXNG (self-hosted, Docker) — Render (separate service) |
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

- Docker (for SearXNG)
- Python 3.11+
- Node.js 18+
- Groq API key — https://console.groq.com

### 1. Start SearXNG

```bash
docker compose up -d
```

SearXNG will be available at `http://localhost:8080`. The included `settings.yml` enables JSON output format automatically.

### 2. Configure environment

```bash
cd backend
cp .env.example .env   # then add your GROQ_API_KEY
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

The intended production setup:

```
Vercel (frontend)  →  Render Web Service (backend)  →  Render Docker Service (SearXNG)
                                                     →  Groq API (LLM)
```

### SearXNG on Render

Deploy as a **Docker** service using the `searxng/searxng` image. Mount `searxng/settings.yml` to `/etc/searxng/settings.yml`. Set `SEARXNG_SECRET` to a random string. The service does not need a public URL — only the backend needs to reach it.

### Backend on Render

Deploy as a **Web Service** (Python). The build command must install Playwright's Chromium:

```bash
pip install -r requirements.txt && playwright install chromium && playwright install-deps chromium
```

Start command:

```bash
uvicorn main:server --host 0.0.0.0 --port $PORT
```

### Frontend on Vercel

Standard Next.js deployment. Set the `BACKEND_URL` environment variable to the Render backend URL.

---

## Environment Variables

### Backend

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq API key for LLM inference |
| `SEARXNG_URL` | No | SearXNG search endpoint (default: `http://localhost:8080/search`) |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins (default: `http://localhost:3000`) |

### Frontend

| Variable | Required | Description |
|----------|----------|-------------|
| `BACKEND_URL` | No | Backend base URL (default: `http://localhost:8000`) |

---

## Notes

- Each research session creates a fresh ChromaDB collection; old collections are cleaned up after 7 days
- SearXNG must be reachable from the backend — if unavailable, search falls back to DuckDuckGo automatically
- The full process takes 2–5 minutes depending on network speed and number of iterations
- fastembed runs inside the backend process — no separate embedding service needed
