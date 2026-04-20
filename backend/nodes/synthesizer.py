import json
import logging
import re
from typing import TYPE_CHECKING

import ollama
from config import EMBED_MODEL, LLM_MODEL
from utils.chroma_client import query_chunks

log = logging.getLogger("synthesizer")
_client = ollama.AsyncClient()

if TYPE_CHECKING:
    from graph import ResearchState


def strip_think_tags(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


async def synthesizer(state: "ResearchState") -> "ResearchState":
    original_query = state["original_query"]
    session_id = state["session_id"]

    log.info("Embedding query for retrieval...")
    embedding_resp = await _client.embeddings(
        model=EMBED_MODEL, prompt=original_query
    )
    query_embedding = embedding_resp["embedding"]

    chunks = query_chunks(session_id, query_embedding, n_results=12)
    log.info(f"Retrieved {len(chunks)} chunks from ChromaDB")

    if not chunks:
        return {
            **state,
            "final_report": "No content was collected to synthesize a report.",
            "gaps": [],
        }

    context_parts = []
    for i, chunk in enumerate(chunks, 1):
        url = chunk["metadata"].get("url", "")
        context_parts.append(f"[{i}] ({url})\n{chunk['text']}")

    context = "\n\n---\n\n".join(context_parts)

    words = context.split()
    if len(words) > 5500:
        context = " ".join(words[:5500])

    prompt = f"""You are a research analyst. Using the provided sources, write a comprehensive research report answering the following question:

QUESTION: {original_query}

SOURCES:
{context}

Write a structured markdown report with:
- A clear introduction
- Multiple sections with ## headings covering different aspects
- Inline citations like [1], [2], etc. referencing the source numbers above
- A balanced, analytical perspective
- A ## Sources section at the end listing all cited URLs

The report should be 800-1500 words.

After the report, add an HTML comment identifying any remaining research gaps:
<!-- GAPS: ["gap 1", "gap 2"] -->

If there are no significant gaps, use: <!-- GAPS: [] -->"""

    log.info("Calling LLM for synthesis...")
    response = await _client.chat(
        model=LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
        options={"num_ctx": 8192},
    )

    raw = strip_think_tags(response["message"]["content"])
    log.info(f"LLM response received ({len(raw)} chars)")

    gaps = []
    gaps_match = re.search(r"<!--\s*GAPS:\s*(\[.*?\])\s*-->", raw, re.DOTALL)
    if gaps_match:
        try:
            gaps = json.loads(gaps_match.group(1))
        except Exception:
            gaps = []
        raw = re.sub(r"<!--\s*GAPS:\s*\[.*?\]\s*-->", "", raw, flags=re.DOTALL).strip()

    return {**state, "final_report": raw, "gaps": gaps}
