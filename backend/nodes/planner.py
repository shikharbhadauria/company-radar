import json
import logging
import re
from typing import TYPE_CHECKING

from groq import AsyncGroq
from config import LLM_MODEL

log = logging.getLogger("planner")
_client = AsyncGroq()

if TYPE_CHECKING:
    from graph import ResearchState


async def planner(state: "ResearchState") -> "ResearchState":
    company = state["company_name"]
    gaps = state.get("gaps", [])
    iteration = state.get("iteration", 1)

    if iteration > 1 and gaps:
        prompt = f"""You are a company research specialist. You are researching "{company}" as a potential employer.

These information gaps remain after initial research:
{json.dumps(gaps)}

Generate 5 targeted search queries to fill these gaps. Prefer site-specific searches on Glassdoor, AmbitionBox, or Reddit.
Return ONLY a valid JSON array of search query strings. No preamble, no markdown fences, no explanation."""
    else:
        prompt = f"""You are a company research specialist. Generate 9 targeted search queries to research "{company}" as a potential employer for a software engineer in India.

You MUST include these exact site-specific queries (replace the company name):
1. site:glassdoor.co.in "{company}" reviews
2. site:ambitionbox.com "{company}"
3. site:reddit.com "{company}" software engineer experience

Also include these broader queries:
4. {company} software engineer salary India ₹ LPA
5. {company} work life balance office culture employee experience
6. {company} management office politics appraisal hike
7. {company} funding revenue employees growth layoffs 2023 2024
8. {company} engineering tech stack interview process
9. {company} Glassdoor AmbitionBox rating reviews

Return ONLY a valid JSON array of exactly 9 search query strings. No preamble, no markdown fences, no explanation."""

    log.info(f"Calling Groq API (iteration={iteration}, gaps={len(gaps)})")
    response = await _client.chat.completions.create(
        model=LLM_MODEL,
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.choices[0].message.content.strip()

    try:
        sub_queries = json.loads(raw)
        if not isinstance(sub_queries, list):
            raise ValueError("Not a list")
    except Exception:
        json_match = re.search(r"\[.*?\]", raw, re.DOTALL)
        if json_match:
            try:
                sub_queries = json.loads(json_match.group(0))
            except Exception:
                sub_queries = []
        if not sub_queries:
            lines = [l.strip().lstrip("-•*123456789.").strip() for l in raw.split("\n")]
            sub_queries = [l for l in lines if l and len(l) > 10][:9]

    if not sub_queries:
        sub_queries = [f"{company} employee reviews salary work culture"]

    log.info(f"Sub-queries: {sub_queries}")
    return {**state, "sub_queries": sub_queries}
