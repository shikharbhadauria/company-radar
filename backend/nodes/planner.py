import json
import logging
import re
from typing import TYPE_CHECKING

import ollama
from config import LLM_MODEL

log = logging.getLogger("planner")
_client = ollama.AsyncClient()

if TYPE_CHECKING:
    from graph import ResearchState


def strip_think_tags(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


async def planner(state: "ResearchState") -> "ResearchState":
    company = state["company_name"]
    gaps = state.get("gaps", [])
    iteration = state.get("iteration", 1)

    if iteration > 1 and gaps:
        prompt = f"""You are a company research specialist. You are researching "{company}" as a potential employer.

These information gaps remain after initial research:
{json.dumps(gaps)}

Generate 4 targeted search queries to fill these gaps. Each query should target a specific source or angle.
Return ONLY a valid JSON array of search query strings. No preamble, no markdown fences, no explanation."""
    else:
        prompt = f"""You are a company research specialist. Generate 5 targeted search queries to research "{company}" as a potential employer.

Cover these angles:
1. Employee reviews and work culture (Glassdoor, AmbitionBox)
2. Software engineer salary data in India (AmbitionBox, Naukri, Levels.fyi)
3. Employee experiences and opinions (Reddit, LinkedIn)
4. Company funding, revenue, growth or layoffs (Tracxn, Crunchbase, news)
5. Engineering culture, tech stack, engineering blog

Return ONLY a valid JSON array of 5 search query strings. No preamble, no markdown fences, no explanation.
Example: ["{company} Glassdoor reviews", "{company} software engineer salary India", ...]"""

    log.info(f"Calling LLM (iteration={iteration}, gaps={len(gaps)})")
    response = await _client.chat(
        model=LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = strip_think_tags(response["message"]["content"])

    try:
        sub_queries = json.loads(raw)
        if not isinstance(sub_queries, list):
            raise ValueError("Not a list")
    except Exception:
        lines = [l.strip().lstrip("-•*123456789.").strip() for l in raw.split("\n")]
        sub_queries = [l for l in lines if l and len(l) > 10][:3]

    if not sub_queries:
        sub_queries = [query]

    log.info(f"Sub-queries: {sub_queries}")
    return {**state, "sub_queries": sub_queries}
