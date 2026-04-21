import json
import logging
import re
from typing import TYPE_CHECKING

import ollama
from groq import AsyncGroq
from config import EMBED_MODEL, SYNTHESIS_MODEL
from utils.chroma_client import query_chunks

log = logging.getLogger("synthesizer")
_ollama_client = ollama.AsyncClient()
_groq_client = AsyncGroq()

if TYPE_CHECKING:
    from graph import ResearchState

_SYSTEM_PROMPT = """You are a brutally honest career advisor and company intelligence analyst. Your job is to write research-backed company intelligence reports for software developers evaluating potential employers.

OUTPUT FORMAT (follow exactly):

## {company_name}

**What this company actually is** (3-4 lines — cut through the marketing, describe what they really do and how they make money)

**Company vitals**
Size | Funding | Revenue | Glassdoor rating | Dev salaries (INR) | Remote policy

---

### Green flags
For each genuine positive signal found in the sources:
- **[Signal name]**: What it is, where you found it ([source number]), why it matters for this candidate

### Red flags
For each genuine concern found in the sources:
- **[Signal name]**: What it is, where you found it ([source number]), why it matters for this candidate

---

**Score:** X green / X red flags

**The thing most people miss about this company:**
One non-obvious insight that doesn't show up in standard checklist reviews.

**Verdict: PURSUE / CAUTION / AVOID**
Be direct. One paragraph. Tell the candidate what you would do if this were your career decision and the single most important reason why.

RULES:
- Only cite signals backed by the provided sources — no guessing
- Salary data must be in INR where available
- No generic flags without evidence from the sources ("good culture" without a source = useless)
- If the sources lack enough data to evaluate a dimension, say so honestly
- Flag anything surprising — good or bad — even if unusual

After the report, add an HTML comment with remaining research gaps:
<!-- GAPS: ["gap 1", "gap 2"] -->

If coverage is sufficient, use: <!-- GAPS: [] -->"""



async def synthesizer(state: "ResearchState") -> "ResearchState":
    original_query = state["original_query"]
    session_id = state["session_id"]

    log.info("Embedding query for retrieval...")
    embedding_resp = await _ollama_client.embeddings(
        model=EMBED_MODEL, prompt=original_query
    )
    query_embedding = embedding_resp["embedding"]

    chunks = query_chunks(session_id, query_embedding, n_results=20)
    log.info(f"Retrieved {len(chunks)} chunks from ChromaDB")

    if not chunks:
        return {
            **state,
            "final_report": "No content was collected to synthesize a report.",
            "gaps": [],
        }

    company_name = state.get("company_name", "this company")
    user_profile = state.get("user_profile", {})
    experience = user_profile.get("experience", "not specified")
    target = user_profile.get("target", "not specified")
    reason_leaving = user_profile.get("reason_leaving", "not specified")
    priorities = user_profile.get("priorities", ["compensation", "work-life balance", "stability", "growth"])
    priorities_str = ", ".join(f"{i+1}. {p}" for i, p in enumerate(priorities))

    context_parts = []
    sources = []
    seen_urls: set = set()
    for i, chunk in enumerate(chunks, 1):
        url = chunk["metadata"].get("url", "")
        title = chunk["metadata"].get("title", "") or url
        context_parts.append(f"[{i}] ({url})\n{chunk['text']}")
        if url and url not in seen_urls:
            seen_urls.add(url)
            sources.append({"index": i, "url": url, "title": title})

    context = "\n\n---\n\n".join(context_parts)

    words = context.split()
    if len(words) > 5000:
        context = " ".join(words[:5000])

    user_message = f"""Analyze "{company_name}" as a potential employer for this candidate:

CANDIDATE PROFILE:
- Experience & stack: {experience}
- Target: {target}
- Leaving because: {reason_leaving}
- Priorities in order: {priorities_str}

RESEARCH SOURCES:
{context}

Write the company intelligence report in the exact format specified. Replace {{company_name}} in the template with "{company_name}"."""

    log.info("Calling Groq API for synthesis...")
    response = await _groq_client.chat.completions.create(
        model=SYNTHESIS_MODEL,
        max_tokens=2048,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
    )

    raw = response.choices[0].message.content.strip()
    log.info(f"Groq response received ({len(raw)} chars)")

    gaps = []
    gaps_match = re.search(r"<!--\s*GAPS:\s*(\[.*?\])\s*-->", raw, re.DOTALL)
    if gaps_match:
        try:
            gaps = json.loads(gaps_match.group(1))
        except Exception:
            gaps = []
        raw = re.sub(r"<!--\s*GAPS:\s*\[.*?\]\s*-->", "", raw, flags=re.DOTALL).strip()

    return {**state, "final_report": raw, "gaps": gaps, "sources": sources}
