import json
import sys
import asyncio
import logging
import requests
from fastapi import FastAPI

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("main")
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def check_ollama():
    try:
        resp = requests.get("http://localhost:11434/api/tags", timeout=5)
        if resp.status_code == 200:
            return True
    except Exception:
        pass
    return False


@app.on_event("startup")
def startup_check():
    if not check_ollama():
        print(
            "ERROR: Ollama is not running or unreachable at http://localhost:11434. "
            "Please start Ollama before running the backend.",
            file=sys.stderr,
        )


class ResearchRequest(BaseModel):
    query: str


def sse_event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def run_research(query: str):
    from graph import research_graph
    from utils.chroma_client import get_collection

    import uuid
    session_id = uuid.uuid4().hex[:8]
    get_collection(session_id)
    log.info(f"[{session_id}] Starting research: {query!r}")

    initial_state = {
        "original_query": query,
        "session_id": session_id,
        "sub_queries": [],
        "collected_chunks": [],
        "iteration": 1,
        "gaps": [],
        "final_report": "",
    }

    node_messages = {
        "planner": "Breaking down your query into sub-questions...",
        "search_embed": "Searching the web and embedding content...",
        "synthesizer": "Synthesizing research into a report...",
        "increment": "Checking for research gaps...",
    }

    try:
        async for event in research_graph.astream_events(initial_state, version="v2"):
            kind = event.get("event")
            name = event.get("name", "")

            if kind == "on_chain_start" and name in node_messages:
                log.info(f"[{session_id}] NODE START: {name}")
                yield sse_event({
                    "type": "progress",
                    "node": name,
                    "message": node_messages[name],
                })
                await asyncio.sleep(0)

            elif kind == "on_chain_end" and name in node_messages:
                log.info(f"[{session_id}] NODE END:   {name}")

                if name == "synthesizer":
                    output = event.get("data", {}).get("output", {})
                    report = output.get("final_report", "")
                    if report:
                        log.info(f"[{session_id}] Report ready ({len(report)} chars)")
                        yield sse_event({"type": "report", "content": report})
                        await asyncio.sleep(0)

    except Exception as e:
        log.exception(f"[{session_id}] Research failed: {e}")
        yield sse_event({"type": "error", "message": str(e)})


@app.post("/research")
async def research(req: ResearchRequest):
    async def stream():
        async for chunk in run_research(req.query):
            yield chunk

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


server = app
