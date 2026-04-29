import hashlib
import logging
import requests
from urllib.parse import urlparse
from typing import TYPE_CHECKING
from langchain_core.callbacks.manager import adispatch_custom_event

log = logging.getLogger("search_embed")
from utils.embedder import embed
from utils.scraper import scrape_urls
from utils.chunker import chunk_text
from utils.chroma_client import add_chunk

if TYPE_CHECKING:
    from graph import ResearchState

import os
SEARXNG_URL = os.environ.get("SEARXNG_URL")
if not SEARXNG_URL:
    raise RuntimeError("SEARXNG_URL env var is required")
MAX_RESULTS_PER_QUERY = 8
MAX_CHUNKS_PER_PAGE = 4

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
    if not text or len(text) < 150:
        return False
    words = [w for w in company_name.lower().split() if len(w) > 3]
    text_lower = text.lower()
    return any(word in text_lower for word in words)


def _search_duckduckgo(query: str) -> list[dict]:
    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; CompanyRadar/1.0)"}
        resp = requests.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
            headers=headers,
            timeout=10,
        )
        from html.parser import HTMLParser

        class DDGParser(HTMLParser):
            def __init__(self):
                super().__init__()
                self.results = []
                self._current_url = ""
                self._capture = False

            def handle_starttag(self, tag, attrs):
                attrs_dict = dict(attrs)
                if tag == "a" and "result__a" in attrs_dict.get("class", ""):
                    self._current_url = attrs_dict.get("href", "")
                    self._capture = True

            def handle_data(self, data):
                if self._capture and self._current_url:
                    self.results.append({"url": self._current_url, "title": data.strip()})
                    self._capture = False
                    self._current_url = ""

            def handle_endtag(self, tag):
                if tag == "a":
                    self._capture = False

        parser = DDGParser()
        parser.feed(resp.text)
        return parser.results[:MAX_RESULTS_PER_QUERY]
    except Exception:
        return []


def search_web(query: str) -> list[dict]:
    try:
        params = {
            "q": query,
            "format": "json",
            "engines": "google,bing,duckduckgo",
        }
        resp = requests.get(SEARXNG_URL, params=params, timeout=10,
                            headers={"X-Forwarded-For": "127.0.0.1"})
        data = resp.json()
        results = data.get("results", [])[:MAX_RESULTS_PER_QUERY]
        if results:
            return [{"url": r.get("url", ""), "title": r.get("title", "")} for r in results if r.get("url")]
    except Exception:
        pass

    log.warning("SearXNG unavailable or returned no results — falling back to DuckDuckGo")
    return _search_duckduckgo(query)


async def search_embed(state: "ResearchState") -> "ResearchState":
    sub_queries = state.get("sub_queries", [])
    collected_chunks = list(state.get("collected_chunks", []))
    existing_urls = {c["url"] for c in collected_chunks}
    iteration = state.get("iteration", 1)
    session_id = state["session_id"]
    company_name = state.get("company_name", "")

    for q_idx, query in enumerate(sub_queries, 1):
        log.info(f"Searching: {query!r}")
        await adispatch_custom_event("progress", {
            "node": "search_embed",
            "message": f"Searching ({q_idx}/{len(sub_queries)})",
            "detail": query,
        })

        results = search_web(query)

        # Filter blocked domains and already-seen URLs
        new_results = [
            r for r in results
            if r["url"] not in existing_urls and _is_allowed(r["url"])
        ]
        # Preferred domains first
        new_results.sort(key=lambda r: _priority(r["url"]))
        log.info(f"  Got {len(results)} results, {len(new_results)} after filtering")

        if not new_results:
            continue

        urls = [r["url"] for r in new_results]
        titles = {r["url"]: r["title"] for r in new_results}

        await adispatch_custom_event("progress", {
            "node": "search_embed",
            "message": f"Scraping {len(urls)} pages",
            "detail": ", ".join(_get_domain(u) for u in urls[:5]),
        })

        log.info(f"  Scraping {len(urls)} URLs...")
        scraped = await scrape_urls(urls)

        embedded_count = 0
        for url, page_data in zip(urls, scraped):
            text = page_data["text"]
            published_date = page_data["date"]
            existing_urls.add(url)
            if not text:
                log.info(f"  Skipped (empty): {url}")
                continue

            if not _is_relevant(text, company_name):
                log.info(f"  Skipped (irrelevant): {url}")
                continue

            chunks = chunk_text(text)[:MAX_CHUNKS_PER_PAGE]
            title = titles.get(url, "")
            log.info(f"  Embedding {len(chunks)} chunks from {url}")
            embedded_count += len(chunks)

            for i, chunk in enumerate(chunks):
                chunk_id = hashlib.md5(f"{url}_{i}".encode()).hexdigest()
                try:
                    embedding = await embed(chunk)

                    metadata = {
                        "url": url,
                        "title": title,
                        "query": query,
                        "iteration": iteration,
                        "published_date": published_date,
                    }

                    add_chunk(session_id, chunk, embedding, metadata, chunk_id)

                    collected_chunks.append({
                        "text": chunk,
                        "url": url,
                        "title": title,
                        "chunk_id": chunk_id,
                    })
                except Exception as e:
                    log.warning(f"  Embed failed for chunk {i} of {url}: {e}")
                    continue

    log.info(f"Done. Total chunks collected: {len(collected_chunks)}")
    await adispatch_custom_event("progress", {
        "node": "search_embed",
        "message": f"Done — collected {len(collected_chunks)} content chunks",
        "detail": "",
    })
    return {**state, "collected_chunks": collected_chunks}
