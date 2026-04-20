import chromadb
from chromadb.config import Settings

_client = None
_registry: dict = {}


def get_client():
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(
            path="./chroma_data",
            settings=Settings(anonymized_telemetry=False),
        )
    return _client


def get_collection(session_id: str = "default"):
    client = get_client()
    name = f"research_chunks_{session_id}"
    try:
        client.delete_collection(name)
    except Exception:
        pass
    collection = client.create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"},
    )
    _registry[session_id] = collection
    return collection


def get_collection_by_session(session_id: str):
    return _registry.get(session_id)


def add_chunk(session_id: str, text: str, embedding: list, metadata: dict, chunk_id: str):
    collection = _registry.get(session_id)
    if collection is None:
        return
    collection.add(
        ids=[chunk_id],
        embeddings=[embedding],
        documents=[text],
        metadatas=[metadata],
    )


def query_chunks(session_id: str, embedding: list, n_results: int = 12):
    collection = _registry.get(session_id)
    if collection is None:
        return []
    count = collection.count()
    if count == 0:
        return []
    n = min(n_results, count)
    results = collection.query(
        query_embeddings=[embedding],
        n_results=n,
        include=["documents", "metadatas", "distances"],
    )
    chunks = []
    for i in range(len(results["ids"][0])):
        chunks.append(
            {
                "text": results["documents"][0][i],
                "metadata": results["metadatas"][0][i],
                "distance": results["distances"][0][i],
            }
        )
    return chunks
