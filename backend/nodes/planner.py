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
    query = state["original_query"]
    gaps = state.get("gaps", [])
    iteration = state.get("iteration", 1)

    if iteration > 1 and gaps:
        prompt = f"""You are a research planner. The original research question is:
"{query}"

After initial research, these gaps remain:
{json.dumps(gaps)}

Generate 3-5 targeted follow-up sub-questions to fill these gaps.
Return ONLY a valid JSON array of strings. No preamble, no markdown fences, no explanation."""
    else:
        prompt = f"""You are a research planner. Break down the following research question into exactly 3 specific sub-questions that together would fully answer it:

"{query}"

Return ONLY a valid JSON array of strings. No preamble, no markdown fences, no explanation.
Example: ["sub-question 1", "sub-question 2", "sub-question 3"]"""

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
