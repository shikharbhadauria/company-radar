# Company Radar

A full-stack company research tool for software engineers evaluating potential employers. Enter a company name and your profile — get a structured intelligence report with green flags, red flags, and a verdict.

## Architecture

- **Frontend**: Next.js 14 (App Router, TypeScript)
- **Backend**: Python FastAPI + LangGraph
- **LLM**: Groq API (`llama-3.3-70b-versatile`)
- **Embeddings**: Ollama (`nomic-embed-text`, local)
- **Web Search**: SearXNG (self-hosted via Docker)
- **Web Scraping**: Playwright
- **Vector Store**: ChromaDB (embedded, persists to disk)

## Prerequisites

- Docker (for SearXNG)
- Ollama installed and running — https://ollama.com
- Groq API key — https://console.groq.com
- Python 3.11+
- Node.js 18+

## Setup

### 1. Pull Ollama embedding model

```bash
ollama pull nomic-embed-text
```

### 2. Start SearXNG

```bash
docker compose up -d
```

### 3. Configure environment

```bash
cd backend
cp .env.example .env   # then add your GROQ_API_KEY
```

### 4. Install Python dependencies

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

### 5. Start the backend

```bash
cd backend
source .venv/bin/activate
uvicorn main:server --port 8000 --reload
```

### 6. Install and start the frontend

```bash
cd frontend
npm install
npm run dev
```

### 7. Open http://localhost:3000

## How It Works

1. You enter a **company name** and your **profile** (experience, target role, priorities, reason for leaving)
2. The **Planner** generates 9 targeted search queries (site-specific: Glassdoor, AmbitionBox, Reddit, LinkedIn, CrunchBase, etc.)
3. The **Search & Embed** node runs queries via SearXNG, scrapes pages with Playwright, chunks and embeds text with Ollama, and stores results in ChromaDB
4. The **Synthesizer** retrieves the top 20 most relevant chunks via cosine similarity and generates a structured report using Groq
5. If research gaps are detected, the loop runs up to 3 iterations with gap-filling queries
6. The final report streams to the browser with:
   - Company vitals (size, funding, ratings, salaries, remote policy)
   - Green flags with inline citations
   - Red flags with inline citations
   - Verdict: **PURSUE / CAUTION / AVOID**
   - Non-obvious insights

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq API key for LLM inference |

## Notes

- Ollama must be running before starting the backend (used for embeddings only)
- SearXNG must be running at `http://localhost:8080`
- Each research session creates a fresh ChromaDB collection
- The full process takes 2–5 minutes depending on network speed
- SearXNG JSON format must be enabled — the included `settings.yml` handles this automatically
