import hashlib
import logging
import requests
import ollama
from config import EMBED_MODEL
from typing import TYPE_CHECKING

log = logging.getLogger("search_embed")
_client = ollama.AsyncClient()
from utils.scraper import scrape_urls
from utils.chunker import chunk_text
from utils.chroma_client import add_chunk

if TYPE_CHECKING:
    from graph import ResearchState

SEARXNG_URL = "http://localhost:8080/search"
MAX_RESULTS_PER_QUERY = 3
MAX_CHUNKS_PER_PAGE = 4


def search_web(query: str) -> list[dict]:
    try:
        params = {
            "q": query,
            "format": "json",
            "engines": "google,bing,duckduckgo",
        }
        resp = requests.get(SEARXNG_URL, params=params, timeout=10)
        data = resp.json()
        results = data.get("results", [])[:MAX_RESULTS_PER_QUERY]
        return [{"url": r.get("url", ""), "title": r.get("title", "")} for r in results if r.get("url")]
    except Exception:
        return []


async def search_embed(state: "ResearchState") -> "ResearchState":
    sub_queries = state.get("sub_queries", [])
    collected_chunks = list(state.get("collected_chunks", []))
    existing_urls = {c["url"] for c in collected_chunks}
    iteration = state.get("iteration", 1)
    session_id = state["session_id"]

    for query in sub_queries:
        log.info(f"Searching: {query!r}")
        results = search_web(query)
        new_results = [r for r in results if r["url"] not in existing_urls]
        log.info(f"  Got {len(results)} results, {len(new_results)} new URLs")

        if not new_results:
            continue

        urls = [r["url"] for r in new_results]
        titles = {r["url"]: r["title"] for r in new_results}

        log.info(f"  Scraping {len(urls)} URLs...")
        scraped_texts = await scrape_urls(urls)

        for url, text in zip(urls, scraped_texts):
            existing_urls.add(url)
            if not text:
                log.info(f"  Skipped (empty): {url}")
                continue

            chunks = chunk_text(text)[:MAX_CHUNKS_PER_PAGE]
            title = titles.get(url, "")
            log.info(f"  Embedding {len(chunks)} chunks from {url}")

            for i, chunk in enumerate(chunks):
                chunk_id = hashlib.md5(f"{url}_{i}".encode()).hexdigest()
                try:
                    embedding_resp = await _client.embeddings(model=EMBED_MODEL, prompt=chunk)
                    embedding = embedding_resp["embedding"]

                    metadata = {
                        "url": url,
                        "title": title,
                        "query": query,
                        "iteration": iteration,
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
    return {**state, "collected_chunks": collected_chunks}
