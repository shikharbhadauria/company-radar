import json
import os
import sys
import asyncio
import logging
from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv()

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


@app.on_event("startup")
def startup_check():
    if not os.environ.get("GROQ_API_KEY"):
        print(
            "ERROR: GROQ_API_KEY is not set. "
            "Please set it in your environment or .env file before running the backend.",
            file=sys.stderr,
        )
    from utils.chroma_client import cleanup_old_collections
    cleanup_old_collections()


class UserProfile(BaseModel):
    experience: str
    target: str
    priorities: list[str]
    reason_leaving: str


class ResearchRequest(BaseModel):
    company_name: str
    user_profile: UserProfile


def sse_event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def run_research(company_name: str, user_profile: dict):
    from graph import research_graph
    from utils.chroma_client import get_collection

    import uuid
    session_id = uuid.uuid4().hex[:8]
    get_collection(session_id)
    log.info(f"[{session_id}] Starting company analysis: {company_name!r}")

    original_query = f"software engineer salary work life balance culture experience at {company_name}"

    initial_state = {
        "original_query": original_query,
        "company_name": company_name,
        "user_profile": user_profile,
        "session_id": session_id,
        "sub_queries": [],
        "collected_chunks": [],
        "iteration": 1,
        "gaps": [],
        "final_report": "",
        "sources": [],
    }

    node_labels = {
        "planner": "Planning research queries",
        "search_embed": "Searching & scraping the web",
        "synthesizer": "Writing the intelligence report",
        "increment": "Checking for research gaps",
    }

    # Collect the final report here — emit once after stream ends, not on every iteration
    last_report = ""
    last_sources: list = []

    try:
        async for event in research_graph.astream_events(initial_state, version="v2"):
            kind = event.get("event")
            name = event.get("name", "")

            if kind == "on_chain_start" and name in node_labels:
                log.info(f"[{session_id}] NODE START: {name}")
                yield sse_event({
                    "type": "progress",
                    "node": name,
                    "message": node_labels[name],
                    "detail": "",
                })
                await asyncio.sleep(0)

            elif kind == "on_chain_end" and name in node_labels:
                log.info(f"[{session_id}] NODE END: {name}")
                if name == "synthesizer":
                    output = event.get("data", {}).get("output", {})
                    last_report = output.get("final_report", "")
                    last_sources = output.get("sources", [])

            elif kind == "on_custom_event" and name == "progress":
                data = event.get("data", {})
                yield sse_event({
                    "type": "progress",
                    "node": data.get("node", ""),
                    "message": data.get("message", ""),
                    "detail": data.get("detail", ""),
                })
                await asyncio.sleep(0)

        if last_report:
            log.info(f"[{session_id}] Report ready ({len(last_report)} chars), emitting once")
            yield sse_event({"type": "report", "content": last_report, "sources": last_sources})

    except Exception as e:
        log.exception(f"[{session_id}] Research failed: {e}")
        yield sse_event({"type": "error", "message": str(e)})


@app.post("/research")
async def research(req: ResearchRequest):
    async def stream():
        async for chunk in run_research(req.company_name, req.user_profile.model_dump()):
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
