import json
import re
import ollama
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from graph import ResearchState


def strip_think_tags(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def planner(state: "ResearchState") -> "ResearchState":
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
        prompt = f"""You are a research planner. Break down the following research question into 3-5 specific sub-questions that together would fully answer it:

"{query}"

Return ONLY a valid JSON array of strings. No preamble, no markdown fences, no explanation.
Example: ["sub-question 1", "sub-question 2", "sub-question 3"]"""

    response = ollama.chat(
        model="deepseek-r1:8b",
        messages=[{"role": "user", "content": prompt}],
    )

    raw = strip_think_tags(response["message"]["content"])

    try:
        sub_queries = json.loads(raw)
        if not isinstance(sub_queries, list):
            raise ValueError("Not a list")
    except Exception:
        lines = [l.strip().lstrip("-•*123456789.").strip() for l in raw.split("\n")]
        sub_queries = [l for l in lines if l and len(l) > 10][:5]

    if not sub_queries:
        sub_queries = [query]

    return {**state, "sub_queries": sub_queries}
