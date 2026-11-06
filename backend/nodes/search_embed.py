"""Search node: Tavily finds pages AND returns their relevant text.

No scraping or local embedding happens on our server — Tavily fetches the
pages from its own infrastructure and returns the most relevant passages,
which the synthesizer then reads directly.
"""
import asyncio
import logging
import os
from typing import TYPE_CHECKING
from urllib.parse import urlparse

import httpx
from langchain_core.callbacks.manager import adispatch_custom_event

from config import TAVILY_SEARCH_DEPTH

if TYPE_CHECKING:
    from graph import ResearchState

log = logging.getLogger("search_embed")

TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY")
if not TAVILY_API_KEY:
    raise RuntimeError("TAVILY_API_KEY env var is required")
TAVILY_URL = "https://api.tavily.com/search"
MAX_RESULTS_PER_QUERY = 5
MIN_CONTENT_CHARS = 150

BLOCKED_DOMAINS = {
    "youtube.com", "youtu.be",
    "facebook.com", "fb.com",
    "twitter.com", "x.com",
    "instagram.com", "pinterest.com",
    "tiktok.com", "snapchat.com",
    "amazon.com", "amazon.in",
    "flipkart.com", "meesho.com", "myntra.com",
    "yandex.com", "yandex.ru",
    "wikimedia.org", "wikipedia.org",
}

PREFERRED_DOMAINS = {
    "glassdoor.com", "glassdoor.co.in",
    "ambitionbox.com",
    "reddit.com",
    "teamblind.com", "blind.com",
    "linkedin.com",
    "crunchbase.com",
    "tracxn.com",
    "levels.fyi",
    "naukri.com",
    "inc42.com",
    "yourstory.com",
    "entrackr.com",
    "techcrunch.com",
    "moneycontrol.com",
    "economictimes.indiatimes.com",
    "timesofindia.com",
    "livemint.com",
    "business-standard.com",
    "thehindu.com",
}


def _get_domain(url: str) -> str:
    try:
        d = urlparse(url).netloc.lower()
        return d[4:] if d.startswith("www.") else d
    except Exception:
        return ""


def _is_allowed(url: str) -> bool:
    domain = _get_domain(url)
    if not domain:
        return False
    return not any(domain == b or domain.endswith("." + b) for b in BLOCKED_DOMAINS)


def _priority(url: str) -> int:
    domain = _get_domain(url)
    return 0 if any(domain == p or domain.endswith("." + p) for p in PREFERRED_DOMAINS) else 1


def _is_relevant(text: str, company_name: str) -> bool:
    if not text or len(text) < MIN_CONTENT_CHARS:
        return False
    text_lower = text.lower()
    words = [w for w in company_name.lower().split() if len(w) > 3]
    if not words:  # short names like "IBM" or "TCS"
        words = [company_name.lower().strip()]
    return any(word in text_lower for word in words)


async def search_web(client: httpx.AsyncClient, query: str) -> list[dict]:
    """Run one Tavily search. Returns results with url, title, content, score."""
    try:
        resp = await client.post(
            TAVILY_URL,
            json={
                "query": query,
                "max_results": MAX_RESULTS_PER_QUERY,
                "search_depth": TAVILY_SEARCH_DEPTH,
            },
            headers={"Authorization": f"Bearer {TAVILY_API_KEY}"},
        )
        resp.raise_for_status()
        return [r for r in resp.json().get("results", []) if r.get("url")]
    except Exception as e:
        log.warning(f"Tavily search failed for {query!r}: {e}")
        return []


async def search_embed(state: "ResearchState") -> "ResearchState":
    sub_queries = state.get("sub_queries", [])
    collected_chunks = list(state.get("collected_chunks", []))
    seen_urls = {c["url"] for c in collected_chunks}
    iteration = state.get("iteration", 1)
    company_name = state.get("company_name", "")

    await adispatch_custom_event("progress", {
        "node": "search_embed",
        "message": f"Searching the web ({len(sub_queries)} queries)",
        "detail": "",
    })

    async with httpx.AsyncClient(timeout=30) as client:
        tasks = [asyncio.create_task(search_web(client, q)) for q in sub_queries]
        done_count = 0
        for finished in asyncio.as_completed(tasks):
            results = await finished
            done_count += 1
            added = 0
            for r in results:
                url = r["url"]
                content = (r.get("content") or "").strip()
                if url in seen_urls or not _is_allowed(url):
                    continue
                if not _is_relevant(content, company_name):
                    continue
                seen_urls.add(url)
                collected_chunks.append({
                    "text": content,
                    "url": url,
                    "title": r.get("title", "") or url,
                    "score": float(r.get("score") or 0),
                    "priority": _priority(url),
                    "iteration": iteration,
                    "published_date": r.get("published_date", "") or "",
                })
                added += 1
            await adispatch_custom_event("progress", {
                "node": "search_embed",
                "message": f"Searching ({done_count}/{len(sub_queries)})",
                "detail": f"{added} useful sources: " + ", ".join(
                    _get_domain(r["url"]) for r in results[:5]
                ),
            })

    log.info(f"Iteration {iteration}: {len(collected_chunks)} sources collected in total")
    await adispatch_custom_event("progress", {
        "node": "search_embed",
        "message": f"Done — collected {len(collected_chunks)} sources",
        "detail": "",
    })
    return {**state, "collected_chunks": collected_chunks}
