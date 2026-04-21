# Build a Local Deep Research System (Free, Unlimited, Runs Entirely on Your Machine)

## Overview

Build a full-stack local research system that replicates how Claude's Research feature works — but runs 100% locally with no API costs, no rate limits, and no data leaving your machine. The system takes a user query, autonomously breaks it into sub-questions, searches the web, scrapes pages, embeds content, and synthesizes a cited markdown report using a local LLM.

---

## Tech Stack (All Free, All Local)

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router, TypeScript) |
| Backend | Python FastAPI |
| Agentic orchestration | LangGraph |
| LLM + embeddings | Ollama (`qwen2.5:1.5b` + `nomic-embed-text`) |
| Web search | SearXNG (self-hosted via Docker) |
| Web scraping | Playwright (Python) |
| Vector store | ChromaDB (embedded, persists to disk) |

---

## Project Structure to Create

```
local-research/
├── docker-compose.yml          # SearXNG container
├── searxng/
│   └── settings.yml            # SearXNG config (enable JSON API)
├── backend/
│   ├── main.py                 # FastAPI server with SSE endpoint
│   ├── graph.py                # LangGraph research graph
│   ├── nodes/
│   │   ├── planner.py          # Decomposes query into sub-questions
│   │   ├── search_embed.py     # Searches, scrapes, chunks, embeds
│   │   └── synthesizer.py      # RAG synthesis with citations
│   ├── utils/
│   │   ├── scraper.py          # Playwright scraping logic
│   │   ├── chunker.py          # Text chunking utilities
│   │   └── chroma_client.py    # ChromaDB singleton
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── page.tsx            # Main research UI
│   │   └── api/
│   │       └── research/
│   │           └── route.ts    # Proxy to FastAPI
│   ├── components/
│   │   ├── ResearchInput.tsx   # Query input + submit
│   │   ├── ProgressStream.tsx  # Live progress display
│   │   └── ReportViewer.tsx    # Markdown report renderer
│   └── package.json
└── README.md
```

---

## Detailed Requirements

### 1. Docker Compose — SearXNG

Create `docker-compose.yml`:

```yaml
services:
  searxng:
    image: searxng/searxng:latest
    ports:
      - "8080:8080"
    volumes:
      - ./searxng:/etc/searxng
    environment:
      - SEARXNG_BASE_URL=http://localhost:8080
    restart: unless-stopped
```

Create `searxng/settings.yml` with:
- `search.formats` including `json`
- Enable engines: `google`, `bing`, `duckduckgo`, `wikipedia`
- Set `server.secret_key` to any random string
- Set `server.bind_address` to `0.0.0.0`

---

### 2. Backend — FastAPI (`backend/main.py`)

- Single POST endpoint: `POST /research` accepting `{ "query": string }`
- Returns a `StreamingResponse` with `media_type="text/event-stream"` (SSE)
- CORS enabled for `http://localhost:3000`
- Each SSE event is a JSON object with one of these shapes:
  - `{ "type": "progress", "node": "planner" | "search_embed" | "synthesizer", "message": string }`
  - `{ "type": "report", "content": string }` — the final markdown report
  - `{ "type": "error", "message": string }`
- Uses LangGraph's `astream_events` to emit progress as each node starts/ends

---

### 3. LangGraph Graph (`backend/graph.py`)

**State TypedDict:**

```python
class ResearchState(TypedDict):
    original_query: str
    sub_queries: List[str]
    collected_chunks: List[dict]   # {text, url, title, chunk_id}
    iteration: int
    gaps: List[str]
    final_report: str
```

**Nodes:**

#### `planner` node (`backend/nodes/planner.py`)
- Calls Ollama (`qwen2.5:1.5b`) to decompose `original_query` into 3–5 specific sub-questions
- On iterations > 1, also receives `gaps` from previous synthesis and generates targeted follow-up queries
- Prompt must instruct the model to return ONLY a valid JSON array of strings — no preamble, no markdown fences
- Parse the response safely with a try/except fallback that splits on newlines if JSON fails
- Updates `state["sub_queries"]`

#### `search_embed` node (`backend/nodes/search_embed.py`)
- For each sub-query in `state["sub_queries"]`:
  1. **Search**: GET `http://localhost:8080/search?q={query}&format=json&engines=google,bing,duckduckgo` — take first 5 results
  2. **Scrape**: Use Playwright to fetch the full page content for each result URL (see scraper below)
  3. **Chunk**: Split the page text into 500-token windows with 50-token overlap using the chunker utility
  4. **Embed**: Call `ollama.embeddings(model="nomic-embed-text", prompt=chunk)` for each chunk
  5. **Store**: Add to ChromaDB collection with metadata `{url, title, query, iteration}`
- Deduplicates by URL — skip URLs already in `state["collected_chunks"]`
- Appends new entries to `state["collected_chunks"]`

#### `synthesizer` node (`backend/nodes/synthesizer.py`)
- Embed `state["original_query"]` using `nomic-embed-text`
- Query ChromaDB for top 15 most similar chunks (cosine similarity)
- Build a context string: each chunk prefixed with `[N] (url)\n{chunk_text}`
- Call Ollama (`qwen2.5:1.5b`) with a prompt that:
  - States the original query
  - Provides all 15 context chunks
  - Instructs to write a structured markdown report
  - Requires inline citations like `[1]`, `[2]` etc.
  - Ends with a `## Sources` section listing all cited URLs
- Also asks the model to identify any remaining gaps as a JSON array in a `<!-- GAPS: [...] -->` HTML comment at the end of the response
- Parse that comment to populate `state["gaps"]`
- Strip the comment from the actual report
- Set `state["final_report"]`

**Routing logic:**

```python
def should_continue(state: ResearchState) -> str:
    if state["iteration"] >= 3:
        return END
    if not state["gaps"]:
        return END
    state["iteration"] += 1
    return "planner"
```

**Graph wiring:**
- Entry point: `planner`
- `planner` → `search_embed`
- `search_embed` → `synthesizer`
- `synthesizer` → conditional: `should_continue` → either `planner` or `END`

---

### 4. Utilities

#### `backend/utils/scraper.py`
- Use `playwright.async_api` with `async_playwright`
- Launch Chromium in headless mode
- For each URL:
  - Navigate with a 15-second timeout
  - Wait for `domcontentloaded`
  - Extract `document.body.innerText` via `page.evaluate`
  - Strip lines shorter than 40 chars (nav/footer noise)
  - Return at most 8000 characters of cleaned text
- Handle exceptions gracefully — return empty string on failure

#### `backend/utils/chunker.py`
- Split text by words (approximate token = word for simplicity)
- `chunk_size=500` words, `overlap=50` words
- Return list of strings

#### `backend/utils/chroma_client.py`
- Use ChromaDB in embedded (in-process) mode
- Persist to `./chroma_data/` directory
- Singleton pattern — one client, one collection named `research_chunks`
- Expose `add_chunk(text, embedding, metadata, id)` and `query(embedding, n_results)` functions

---

### 5. Frontend — Next.js

#### `frontend/app/page.tsx`
Main page layout with three sections rendered in sequence:
1. `<ResearchInput>` — always visible at top
2. `<ProgressStream>` — visible during research (shows live node progress)
3. `<ReportViewer>` — visible when report arrives

State: `query`, `status` (`idle | loading | done | error`), `progressEvents[]`, `report`

On submit: POST to `/api/research` and consume SSE stream using `fetch` + `ReadableStream` + `TextDecoder`

#### `frontend/components/ResearchInput.tsx`
- `<textarea>` for multi-line query input (auto-resize)
- Submit button labeled "Research"
- Disabled while loading
- Show estimated time text: "This takes 3–8 minutes depending on your machine"

#### `frontend/components/ProgressStream.tsx`
- Shows each SSE progress event as it arrives
- Format: icon + node name + message in a vertical list
- Animate in with a fade
- Use different icons/colors per node: planner (purple), search_embed (blue), synthesizer (green)

#### `frontend/components/ReportViewer.tsx`
- Render the markdown report using `react-markdown` with `remark-gfm`
- Show a "Copy report" button
- Show a "New research" button that resets state

#### `frontend/app/api/research/route.ts`
- Proxy POST requests to `http://localhost:8000/research`
- Forward the SSE stream directly back to the client
- Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`

---

### 6. `backend/requirements.txt`

```
fastapi
uvicorn[standard]
langgraph
langchain-core
chromadb
ollama
playwright
requests
python-dotenv
```

---

### 7. `README.md`

Include clear setup instructions:

```
## Prerequisites
- Docker (for SearXNG)
- Ollama installed and running (https://ollama.com)
- Python 3.11+
- Node.js 18+

## Setup

# 1. Pull Ollama models
ollama pull qwen2.5:1.5b
ollama pull nomic-embed-text

# 2. Start SearXNG
docker compose up -d

# 3. Install Python deps
cd backend
pip install -r requirements.txt
playwright install chromium

# 4. Start backend
uvicorn main:server --port 8000 --reload

# 5. Install and start frontend
cd frontend
npm install
npm run dev

# 6. Open http://localhost:3000
```

---

## Important Implementation Notes

1. **Ollama must be running** before the backend starts. The backend should check on startup and log a clear error if Ollama is unreachable at `http://localhost:11434`.

2. **ChromaDB collection** should be reset between research sessions (or namespaced by session ID) to avoid cross-contamination of embeddings from previous queries.

3. **SearXNG JSON format** must be explicitly enabled in `settings.yml`. Without it, requests with `?format=json` return HTML. The `formats` key under `search` must include `json`.

4. **Playwright scraping** will fail on some sites (bot detection, paywalls). Always catch exceptions and continue — don't let one failed scrape crash the entire search_embed node.

5. **qwen2.5:1.5b** is a compact model — keep prompts concise to stay within its context window and ensure clean structured outputs (JSON arrays, markdown).

6. **SSE in Next.js**: Use `fetch` with `{ cache: 'no-store' }` and manually parse the stream. Do NOT use EventSource — it doesn't support POST requests.

7. **LangGraph astream_events**: Use `version="v2"` in the call. Listen for `on_chain_start` events to emit progress, and `on_chain_end` on the `synthesizer` node to emit the final report.

8. **Token length**: The project explicitly sets `num_ctx: 8192` for `qwen2.5:1.5b`. Keep the synthesis prompt (context chunks + instruction) under ~6000 words. Limit to 12 chunks if needed.

9. **ChromaDB cosine similarity**: Pass `distance_metric="cosine"` when creating the collection to ensure semantic similarity (not Euclidean distance).

10. **CORS**: The FastAPI server must allow `http://localhost:3000`. Use `CORSMiddleware` with `allow_origins=["http://localhost:3000"]`, `allow_methods=["*"]`, `allow_headers=["*"]`.

---

## Expected Behavior

1. User types a research query (e.g., "What are the pros and cons of working at product startups vs enterprise companies for a software engineer in India?")
2. Frontend shows "Planner running..." → "Searching and embedding..." → "Synthesizing report..."
3. After 3–8 minutes, a full markdown report appears with inline citations and a sources section
4. The loop runs up to 3 iterations if gaps are detected
5. The final report is ~800–1500 words, structured with headings, covering multiple angles of the query

---

Build the complete project end-to-end. Create all files. Make it runnable with the setup steps above.
