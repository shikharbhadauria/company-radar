import json
import re
import ollama
from typing import TYPE_CHECKING
from utils.chroma_client import query_chunks

if TYPE_CHECKING:
    from graph import ResearchState


def strip_think_tags(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def synthesizer(state: "ResearchState") -> "ResearchState":
    original_query = state["original_query"]
    collection = state.get("_collection")

    embedding_resp = ollama.embeddings(model="nomic-embed-text", prompt=original_query)
    query_embedding = embedding_resp["embedding"]

    if collection is not None:
        chunks = query_chunks(collection, query_embedding, n_results=12)
    else:
        chunks = [
            {"text": c["text"], "metadata": {"url": c["url"], "title": c.get("title", "")}}
            for c in state.get("collected_chunks", [])[:12]
        ]

    if not chunks:
        return {**state, "final_report": "No content was collected to synthesize a report.", "gaps": []}

    context_parts = []
    for i, chunk in enumerate(chunks, 1):
        url = chunk["metadata"].get("url", "")
        context_parts.append(f"[{i}] ({url})\n{chunk['text']}")

    context = "\n\n---\n\n".join(context_parts)

    word_count = len(context.split())
    if word_count > 5500:
        words = context.split()[:5500]
        context = " ".join(words)

    prompt = f"""You are a research analyst. Using the provided sources, write a comprehensive research report answering the following question:

QUESTION: {original_query}

SOURCES:
{context}

Write a structured markdown report with:
- A clear introduction
- Multiple sections with ## headings covering different aspects
- Inline citations like [1], [2], etc. referencing the source numbers above
- A balanced, analytical perspective
- A ## Sources section at the end listing all cited URLs

The report should be 800-1500 words.

After the report, add an HTML comment identifying any remaining research gaps:
<!-- GAPS: ["gap 1", "gap 2"] -->

If there are no significant gaps, use: <!-- GAPS: [] -->"""

    response = ollama.chat(
        model="deepseek-r1:8b",
        messages=[{"role": "user", "content": prompt}],
        options={"num_ctx": 8192},
    )

    raw = strip_think_tags(response["message"]["content"])

    gaps = []
    gaps_match = re.search(r"<!--\s*GAPS:\s*(\[.*?\])\s*-->", raw, re.DOTALL)
    if gaps_match:
        try:
            gaps = json.loads(gaps_match.group(1))
        except Exception:
            gaps = []
        raw = re.sub(r"<!--\s*GAPS:\s*\[.*?\]\s*-->", "", raw, flags=re.DOTALL).strip()

    return {**state, "final_report": raw, "gaps": gaps}
