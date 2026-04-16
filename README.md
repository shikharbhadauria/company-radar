# Local Deep Research

A full-stack local research system that replicates Claude's Research feature — runs 100% locally with no API costs, no rate limits, and no data leaving your machine.

## Architecture

- **Frontend**: Next.js 14 (App Router, TypeScript)
- **Backend**: Python FastAPI + LangGraph
- **LLM + Embeddings**: Ollama (`deepseek-r1:8b` + `nomic-embed-text`)
- **Web Search**: SearXNG (self-hosted via Docker)
- **Web Scraping**: Playwright
- **Vector Store**: ChromaDB (embedded, persists to disk)

## Prerequisites

- Docker (for SearXNG)
- Ollama installed and running — https://ollama.com
- Python 3.11+
- Node.js 18+

## Setup

### 1. Pull Ollama models

```bash
ollama pull deepseek-r1:8b
ollama pull nomic-embed-text
```

### 2. Start SearXNG

```bash
docker compose up -d
```

### 3. Install Python dependencies

```bash
cd backend
pip install -r requirements.txt
playwright install chromium
```

### 4. Start the backend

```bash
cd backend
uvicorn main:server --port 8000 --reload
```

### 5. Install and start the frontend

```bash
cd frontend
npm install
npm run dev
```

### 6. Open http://localhost:3000

## How It Works

1. You type a research query
2. The **Planner** node decomposes it into 3–5 sub-questions using `deepseek-r1:8b`
3. The **Search & Embed** node searches SearXNG, scrapes pages with Playwright, chunks the text, embeds it with `nomic-embed-text`, and stores it in ChromaDB
4. The **Synthesizer** node retrieves the top 12 most relevant chunks via cosine similarity and generates a structured markdown report with inline citations
5. If research gaps are detected, the loop runs up to 3 iterations
6. The final report appears in the browser with copy and reset options

## Notes

- Ollama must be running before starting the backend
- Each research session creates a fresh ChromaDB collection to avoid cross-contamination
- The full process takes 3–8 minutes depending on your hardware
- SearXNG JSON format must be enabled — the included `settings.yml` does this automatically
