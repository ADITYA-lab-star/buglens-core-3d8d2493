"""
RAG Service — MongoDB Atlas Vector Search backend.

Replaces the ChromaDB implementation with MongoDB Atlas Vector Search so that
embeddings are stored and queried inside the same Atlas cluster used for
reviews and user settings.

Architecture
------------
- Ingestion  : ingest_mongo.py (CLI, admin use) OR POST /chat/ingest-github (per-user)
- Embedding  : Gemini gemini-embedding-001 via REST (3072-dim vectors)
- Storage    : MongoDB collection ``code_chunks``
- Index      : Atlas Vector Search index named ``vector_index`` on ``embedding`` field
- Query      : $vectorSearch aggregation pipeline

Per-User Isolation
------------------
Every ``code_chunks`` document is stamped with the Firebase ``uid`` of the user
who ingested it.  All reads (list_collections, query_repository) filter by uid
so users only ever see their own repositories.
"""

import asyncio
import logging
from typing import Any, AsyncIterator

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

GEMINI_BATCH_EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{EMBEDDING_MODEL}:batchEmbedContents"
)

# GitHub ingestion limits (frontend ingestion only)
MAX_FILES_FRONTEND   = 200   # cap to keep embedding time reasonable
EMBED_BATCH_SIZE     = 10    # chunks per Gemini batchEmbedContents call
CHUNK_TOKENS         = 400
CHUNK_OVERLAP        = 50


# ---------------------------------------------------------------------------
# Embedding helpers
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
                "taskType": "RETRIEVAL_QUERY",
            },
        )
        resp.raise_for_status()
        return resp.json()["embedding"]["values"]


async def _embed_batch(texts: list[str], api_key: str) -> list[list[float]]:
    """Embed a batch of texts using batchEmbedContents (more efficient)."""
    requests_payload = [
        {
            "model": f"models/{EMBEDDING_MODEL}",
            "content": {"parts": [{"text": t.replace("\n", " ")}]},
            "taskType": "RETRIEVAL_DOCUMENT",
        }
        for t in texts
    ]
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            GEMINI_BATCH_EMBED_URL,
            params={"key": api_key},
            json={"requests": requests_payload},
        )
        resp.raise_for_status()
        return [item["values"] for item in resp.json()["embeddings"]]


# ---------------------------------------------------------------------------
# Text chunking (mirrors ingest_mongo.py logic)
# ---------------------------------------------------------------------------

def _rough_token_count(text: str) -> int:
    return max(1, len(text) // 4)


def _chunk_text(text: str) -> list[str]:
    """Split text into overlapping chunks aligned to newlines."""
    lines = text.splitlines(keepends=True)
    chunks: list[str] = []
    current: list[str] = []
    current_tokens = 0

    for line in lines:
        lt = _rough_token_count(line)
        if current_tokens + lt > CHUNK_TOKENS and current:
            chunks.append("".join(current))
            # keep overlap
            overlap: list[str] = []
            ot = 0
            for prev in reversed(current):
                pt = _rough_token_count(prev)
                if ot + pt > CHUNK_OVERLAP:
                    break
                overlap.insert(0, prev)
                ot += pt
            current = overlap
            current_tokens = ot
        current.append(line)
        current_tokens += lt

    if current:
        chunks.append("".join(current))

    return [c for c in chunks if c.strip()]


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

    def _get_api_key(self, gemini_api_key: str | None) -> str:
        key = gemini_api_key or settings.GEMINI_API_KEY
        if not key:
            raise RuntimeError(
                "No Gemini API key available. Set GEMINI_API_KEY in .env "
                "or add your own key in Settings."
            )
        return key

    # ------------------------------------------------------------------
    # list_collections — returns distinct repo names for this user only
    # ------------------------------------------------------------------

    async def list_collections(self, uid: str) -> list[str]:
        """Return the names of all repositories ingested by *uid*."""
        try:
            repos = await self._db.code_chunks.distinct(
                "repository_name", {"uid": uid}
            )
            return sorted(repos)
        except Exception as exc:
            logger.warning("list_collections failed: %s", exc)
            return []

    # ------------------------------------------------------------------
    # ingest_repository — lightweight API ingestion (small payloads)
    # ------------------------------------------------------------------

    async def ingest_repository(
        self,
        repo_name: str,
        files: list[dict[str, str]],
        uid: str,
        gemini_api_key: str | None = None,
        openai_api_key: str | None = None,
    ) -> int:
        """Chunk, embed, and store files. Stamps every document with *uid*.

        For large repos use ingest_mongo.py CLI (admin) or the streaming
        variant ``ingest_repository_streaming`` (frontend /ingest-github).
        """
        api_key = self._get_api_key(gemini_api_key)
        collection = self._db.code_chunks
        total = 0

        for file_info in files:
            file_path: str = file_info.get("path", "unknown")
            content: str = file_info.get("content", "")
            if not content.strip():
                continue

            chunks = _chunk_text(content)

            for idx, chunk_text in enumerate(chunks):
                if not chunk_text.strip():
                    continue
                try:
                    vector = await _embed_query(chunk_text, api_key)
                except Exception as exc:
                    logger.warning(
                        "Embedding failed for %s chunk %d: %s", file_path, idx, exc
                    )
                    continue

                await collection.insert_one(
                    {
                        "uid": uid,
                        "repository_name": repo_name,
                        "file_path": file_path,
                        "text": chunk_text,
                        "chunk_index": idx,
                        "embedding": vector,
                        "embedding_model": EMBEDDING_MODEL,
                        "token_count": _rough_token_count(chunk_text),
                    }
                )
                total += 1

        logger.info("API ingest '%s' (uid=%s): %d chunks inserted.", repo_name, uid, total)
        return total

    # ------------------------------------------------------------------
    # ingest_repository_streaming — used by POST /chat/ingest-github
    # ------------------------------------------------------------------

    async def ingest_repository_streaming(
        self,
        repo_name: str,
        files: list[dict[str, str]],
        uid: str,
        gemini_api_key: str | None = None,
        openai_api_key: str | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Chunk, batch-embed, and store files — yields progress dicts.

        Yields dicts with a ``type`` key:
            {"type": "progress", "phase": "chunking", "done": N, "total": M}
            {"type": "progress", "phase": "embedding", "batch": N, "total_batches": M}
            {"type": "progress", "phase": "storing",  "done": N, "total": M}
            {"type": "done",     "chunks_upserted": N}
            {"type": "error",    "message": "..."}
        """
        api_key = self._get_api_key(gemini_api_key)
        collection = self._db.code_chunks

        # Step 1 — Chunk all files
        all_docs: list[dict] = []
        for i, file_info in enumerate(files):
            file_path = file_info.get("path", "unknown")
            content   = file_info.get("content", "")
            if not content.strip():
                continue
            for idx, chunk_text in enumerate(_chunk_text(content)):
                if not chunk_text.strip():
                    continue
                all_docs.append(
                    {
                        "uid": uid,
                        "repository_name": repo_name,
                        "file_path": file_path,
                        "text": chunk_text,
                        "chunk_index": idx,
                        "embedding_model": EMBEDDING_MODEL,
                        "token_count": _rough_token_count(chunk_text),
                    }
                )
            yield {
                "type": "progress",
                "phase": "chunking",
                "done": i + 1,
                "total": len(files),
                "file": file_path,
            }

        total_chunks = len(all_docs)
        if total_chunks == 0:
            yield {"type": "error", "message": "No non-empty chunks produced."}
            return

        # Step 2 — Batch embed
        total_batches = (total_chunks + EMBED_BATCH_SIZE - 1) // EMBED_BATCH_SIZE
        inserted = 0

        for batch_num, start in enumerate(range(0, total_chunks, EMBED_BATCH_SIZE)):
            batch = all_docs[start : start + EMBED_BATCH_SIZE]
            texts = [doc["text"] for doc in batch]

            try:
                vectors = await _embed_batch(texts, api_key)
            except Exception as exc:
                logger.warning("Batch embed failed (batch %d): %s", batch_num, exc)
                yield {
                    "type": "progress",
                    "phase": "embedding",
                    "batch": batch_num + 1,
                    "total_batches": total_batches,
                    "warning": str(exc),
                }
                continue

            # Step 3 — Store batch
            docs_to_insert = []
            for doc, vec in zip(batch, vectors):
                docs_to_insert.append({**doc, "embedding": vec})

            try:
                await collection.insert_many(docs_to_insert)
                inserted += len(docs_to_insert)
            except Exception as exc:
                logger.error("MongoDB insert failed (batch %d): %s", batch_num, exc)
                yield {"type": "error", "message": f"Database insert failed: {exc}"}
                return

            yield {
                "type": "progress",
                "phase": "embedding",
                "batch": batch_num + 1,
                "total_batches": total_batches,
                "chunks_done": inserted,
                "total_chunks": total_chunks,
            }

            # Avoid hammering Gemini rate limits
            if start + EMBED_BATCH_SIZE < total_chunks:
                await asyncio.sleep(0.5)

        yield {"type": "done", "chunks_upserted": inserted}

    # ------------------------------------------------------------------
    # query_repository — Atlas $vectorSearch pipeline
    # ------------------------------------------------------------------

    async def query_repository(
        self,
        repo_name: str,
        user_query: str,
        uid: str,
        top_k: int = TOP_K,
        gemini_api_key: str | None = None,
        openai_api_key: str | None = None,
    ) -> list[dict[str, Any]]:
        """Semantically search *repo_name* for *uid* and return the top-k chunks.

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
        # narrow to the correct repository AND user with a $match stage.
        pipeline = [
            {
                "$vectorSearch": {
                    "index": ATLAS_INDEX,
                    "path": "embedding",
                    "queryVector": query_vector,
                    "numCandidates": top_k * 20,   # wider set to absorb post-filter loss
                    "limit": top_k * 4,             # fetch more than needed; $match will trim
                }
            },
            # Scope results to this user's repository only
            {"$match": {"repository_name": repo_name, "uid": uid}},
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
