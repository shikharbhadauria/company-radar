import json
import logging
import re
from typing import TYPE_CHECKING

from config import LLM_MODEL
from groq import AsyncGroq

log = logging.getLogger("planner")
_client = AsyncGroq(max_retries=5)

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

Generate 5 targeted search queries to fill these gaps. Prefer site-specific searches on Glassdoor, AmbitionBox, TeamBlind, Levels.fyi, Naukri, or Reddit.
Return ONLY a valid JSON array of search query strings. No preamble, no markdown fences, no explanation."""
    else:
        prompt = f"""You are a company research specialist. Generate 11 targeted search queries to research "{company}" as a potential employer for a software engineer in India.

You MUST include these exact site-specific queries (replace the company name):
1. site:glassdoor.co.in "{company}" reviews
2. site:ambitionbox.com "{company}"
3. site:reddit.com "{company}" software engineer experience
4. site:teamblind.com "{company}"
5. site:levels.fyi "{company}" salary
6. site:naukri.com "{company}" reviews

Also include these broader queries:
7. {company} software engineer salary India ₹ LPA
8. {company} work life balance office culture employee experience
9. {company} management appraisal hike layoffs 2024 2025
10. {company} funding revenue employees headcount growth
11. {company} engineering tech stack interview process

Return ONLY a valid JSON array of exactly 11 search query strings. No preamble, no markdown fences, no explanation."""

    log.info(f"Calling Groq API (iteration={iteration}, gaps={len(gaps)})")
    response = await _client.chat.completions.create(
        model=LLM_MODEL,
        max_tokens=1500,
        reasoning_effort="low",
        messages=[{"role": "user", "content": prompt}],
    )

    raw = (response.choices[0].message.content or "").strip()

    sub_queries = []
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
            sub_queries = [l for l in lines if l and len(l) > 10][:11]

    if not sub_queries:
        sub_queries = [f"{company} employee reviews salary work culture"]

    log.info(f"Sub-queries: {sub_queries}")
    return {**state, "sub_queries": sub_queries}
