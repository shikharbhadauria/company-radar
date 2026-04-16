import asyncio
import hashlib
import requests
import ollama
from typing import TYPE_CHECKING
from utils.scraper import scrape_urls
from utils.chunker import chunk_text

if TYPE_CHECKING:
    from graph import ResearchState

SEARXNG_URL = "http://localhost:8080/search"


def search_web(query: str, num_results: int = 5) -> list[dict]:
    try:
        params = {
            "q": query,
            "format": "json",
            "engines": "google,bing,duckduckgo",
        }
        resp = requests.get(SEARXNG_URL, params=params, timeout=10)
        data = resp.json()
        results = data.get("results", [])[:num_results]
        return [{"url": r.get("url", ""), "title": r.get("title", "")} for r in results if r.get("url")]
    except Exception:
        return []


def search_embed(state: "ResearchState") -> "ResearchState":
    sub_queries = state.get("sub_queries", [])
    collected_chunks = list(state.get("collected_chunks", []))
    existing_urls = {c["url"] for c in collected_chunks}
    iteration = state.get("iteration", 1)
    collection = state.get("_collection")

    for query in sub_queries:
        results = search_web(query)
        new_results = [r for r in results if r["url"] not in existing_urls]

        if not new_results:
            continue

        urls = [r["url"] for r in new_results]
        titles = {r["url"]: r["title"] for r in new_results}

        scraped_texts = asyncio.run(scrape_urls(urls))

        for url, text in zip(urls, scraped_texts):
            if not text:
                existing_urls.add(url)
                continue

            chunks = chunk_text(text)
            title = titles.get(url, "")

            for i, chunk in enumerate(chunks):
                chunk_id = hashlib.md5(f"{url}_{i}".encode()).hexdigest()
                try:
                    embedding_resp = ollama.embeddings(model="nomic-embed-text", prompt=chunk)
                    embedding = embedding_resp["embedding"]

                    metadata = {
                        "url": url,
                        "title": title,
                        "query": query,
                        "iteration": iteration,
                    }

                    if collection is not None:
                        from utils.chroma_client import add_chunk
                        add_chunk(collection, chunk, embedding, metadata, chunk_id)

                    collected_chunks.append({
                        "text": chunk,
                        "url": url,
                        "title": title,
                        "chunk_id": chunk_id,
                    })
                except Exception:
                    continue

            existing_urls.add(url)

    return {**state, "collected_chunks": collected_chunks}
