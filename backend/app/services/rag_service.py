"""
RAG Service — MongoDB Atlas Vector Search backend.

Replaces the ChromaDB implementation with MongoDB Atlas Vector Search so that
embeddings are stored and queried inside the same Atlas cluster used for
reviews and user settings.

Architecture
------------
- Ingestion  : ingest_mongo.py (CLI script, run once per repo)
- Embedding  : Gemini gemini-embedding-001 via REST (3072-dim vectors)
- Storage    : MongoDB collection ``code_chunks``
- Index      : Atlas Vector Search index named ``vector_index`` on ``embedding`` field
- Query      : $vectorSearch aggregation pipeline
"""

import logging
from typing import Any

import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants — must match what ingest_mongo.py used
# ---------------------------------------------------------------------------
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMS  = 3072
TOP_K           = 5
ATLAS_INDEX     = "vector_index"          # name of your Atlas Vector Search index

GEMINI_EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{EMBEDDING_MODEL}:embedContent"
)


# ---------------------------------------------------------------------------
# Embedding helper (single vector — used for query-time embedding)
# ---------------------------------------------------------------------------

async def _embed_query(text: str, api_key: str) -> list[float]:
    """Embed a single query string using Gemini gemini-embedding-001 (3072-dim)."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            GEMINI_EMBED_URL,
            params={"key": api_key},
            json={
                "model": f"models/{EMBEDDING_MODEL}",
                "content": {"parts": [{"text": text.replace("\n", " ")}]},
                "taskType": "RETRIEVAL_QUERY",   # query-side task type
            },
        )
        resp.raise_for_status()
        return resp.json()["embedding"]["values"]


# ---------------------------------------------------------------------------
# RAGService
# ---------------------------------------------------------------------------

class RAGService:
    """Semantic retrieval over ingested repositories via MongoDB Atlas Vector Search."""

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._db = db

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_api_key(
        self,
        gemini_api_key: str | None,
    ) -> str:
        key = gemini_api_key or settings.GEMINI_API_KEY
        if not key:
            raise RuntimeError(
                "No Gemini API key available. Set GEMINI_API_KEY in .env "
                "or add your own key in Settings."
            )
        return key

    # ------------------------------------------------------------------
    # list_collections — returns distinct repo names in code_chunks
    # ------------------------------------------------------------------

    async def list_collections(self) -> list[str]:
        """Return the names of all ingested repositories."""
        try:
            repos = await self._db.code_chunks.distinct("repository_name")
            return sorted(repos)
        except Exception as exc:
            logger.warning("list_collections failed: %s", exc)
            return []

    # ------------------------------------------------------------------
    # ingest_repository — kept for API compatibility (delegates to CLI)
    # ------------------------------------------------------------------

    async def ingest_repository(
        self,
        repo_name: str,
        files: list[dict[str, str]],
        gemini_api_key: str | None = None,
        openai_api_key: str | None = None,
    ) -> int:
        """Lightweight in-process ingestion (for small payloads via API).

        For large repos use ingest_mongo.py CLI instead which is
        rate-limit-aware and has resume support.
        """
        api_key = self._get_api_key(gemini_api_key)
        collection = self._db.code_chunks
        total = 0

        for file_info in files:
            file_path: str = file_info.get("path", "unknown")
            content: str = file_info.get("content", "")
            if not content.strip():
                continue

            # Simple line-based chunking for API ingestion
            lines = content.splitlines(keepends=True)
            chunks: list[str] = []
            chunk: list[str] = []
            token_est = 0
            for line in lines:
                lt = max(1, len(line) // 4)
                if token_est + lt > 400 and chunk:
                    chunks.append("".join(chunk))
                    chunk = []
                    token_est = 0
                chunk.append(line)
                token_est += lt
            if chunk:
                chunks.append("".join(chunk))

            for idx, chunk_text in enumerate(chunks):
                if not chunk_text.strip():
                    continue
                try:
                    vector = await _embed_query(chunk_text, api_key)
                except Exception as exc:
                    logger.warning("Embedding failed for %s chunk %d: %s", file_path, idx, exc)
                    continue

                await collection.insert_one({
                    "repository_name": repo_name,
                    "file_path": file_path,
                    "text": chunk_text,
                    "chunk_index": idx,
                    "embedding": vector,
                    "embedding_model": EMBEDDING_MODEL,
                    "token_count": max(1, len(chunk_text) // 4),
                })
                total += 1

        logger.info("API ingest '%s': %d chunks inserted.", repo_name, total)
        return total

    # ------------------------------------------------------------------
    # query_repository — Atlas $vectorSearch pipeline
    # ------------------------------------------------------------------

    async def query_repository(
        self,
        repo_name: str,
        user_query: str,
        top_k: int = TOP_K,
        gemini_api_key: str | None = None,
        openai_api_key: str | None = None,
    ) -> list[dict[str, Any]]:
        """Semantically search *repo_name* and return the top-k chunks.

        Uses MongoDB Atlas $vectorSearch aggregation pipeline.

        Returns
        -------
        List of dicts with keys: ``document``, ``file_path``,
        ``chunk_index``, ``distance``.
        """
        api_key = self._get_api_key(gemini_api_key)

        # 1. Embed the user query
        try:
            query_vector = await _embed_query(user_query, api_key)
        except Exception as exc:
            raise RuntimeError(f"Failed to embed query: {exc}") from exc

        # 2. Run Atlas Vector Search pipeline
        #
        # NOTE: The `filter` field *inside* $vectorSearch is only honoured when
        # the Atlas index is configured with pre-filter fields.  To work with
        # any index configuration we retrieve a larger candidate set and then
        # narrow to the correct repository with a $match stage.
        pipeline = [
            {
                "$vectorSearch": {
                    "index": ATLAS_INDEX,
                    "path": "embedding",
                    "queryVector": query_vector,
                    "numCandidates": top_k * 20,   # wider candidate set to absorb post-filter loss
                    "limit": top_k * 4,             # fetch more than needed; $match will trim
                }
            },
            # Filter AFTER the ANN search so it works for all index configurations
            {"$match": {"repository_name": repo_name}},
            {
                "$project": {
                    "_id": 0,
                    "text": 1,
                    "file_path": 1,
                    "chunk_index": 1,
                    "score": {"$meta": "vectorSearchScore"},
                }
            },
            {"$limit": top_k},
        ]

        try:
            cursor = self._db.code_chunks.aggregate(pipeline)
            results = await cursor.to_list(length=top_k)
        except Exception as exc:
            logger.error("Atlas vectorSearch failed: %s", exc)
            raise RuntimeError(f"Vector search failed: {exc}") from exc

        return [
            {
                "document":    r.get("text", ""),
                "file_path":   r.get("file_path", "unknown"),
                "chunk_index": r.get("chunk_index", 0),
                "distance":    round(1 - r.get("score", 1), 4),  # cosine: score→distance
            }
            for r in results
        ]
