import asyncio
from fastembed import TextEmbedding

_model = TextEmbedding("BAAI/bge-small-en-v1.5")


async def embed(text: str) -> list[float]:
    return await asyncio.to_thread(_embed_sync, text)


def _embed_sync(text: str) -> list[float]:
    return list(_model.embed([text]))[0].tolist()
