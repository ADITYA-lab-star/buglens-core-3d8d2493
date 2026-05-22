import asyncio
import logging
from pathlib import Path
from typing import Any

import chromadb
import tiktoken

from app.services.embeddings import get_embedding

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CHROMA_PERSIST_DIR = ".chroma_db"          # local persistent storage path
EMBEDDING_MODEL    = "text-embedding-3-small"
CHUNK_TOKEN_LIMIT  = 400                   # max tokens per chunk
CHUNK_OVERLAP      = 40                    # overlapping tokens between chunks
TOP_K              = 5                     # number of chunks returned per query
ENCODING_NAME      = "cl100k_base"        # tiktoken encoding compatible with text-embedding-3-small


# ---------------------------------------------------------------------------
# Token-aware chunker
# ---------------------------------------------------------------------------
def _chunk_code(text: str, limit: int = CHUNK_TOKEN_LIMIT, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split *text* into overlapping token-bounded chunks.

    Falls back to line-based chunking when the tiktoken encoding cannot be
    loaded (e.g., offline environments without the tiktoken BPE data).
    """
    try:
        enc = tiktoken.get_encoding(ENCODING_NAME)
        tokens = enc.encode(text)
        chunks: list[str] = []
        start = 0
        while start < len(tokens):
            end = min(start + limit, len(tokens))
            chunks.append(enc.decode(tokens[start:end]))
            start += limit - overlap
        return [c for c in chunks if c.strip()]
    except Exception as exc:
        logger.warning("tiktoken chunking failed (%s), falling back to line chunking.", exc)
        lines = text.splitlines()
        chunks = []
        step = max(limit // 10, 1)
        for i in range(0, len(lines), step - overlap // 10):
            chunk = "\n".join(lines[i : i + step])
            if chunk.strip():
                chunks.append(chunk)
        return chunks


# ---------------------------------------------------------------------------
# RAGService
# ---------------------------------------------------------------------------
class RAGService:
    """Manages code ingestion and semantic retrieval via ChromaDB + OpenAI embeddings."""

    def __init__(self) -> None:
        self._client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)

    def _collection(self, repo_name: str) -> chromadb.Collection:
        """Return (or create) the ChromaDB collection for *repo_name*.

        Collection names follow the regex ``^[a-zA-Z0-9_-]+$`` so we sanitize
        the repo_name by replacing slashes and dots with underscores.
        """
        safe_name = repo_name.replace("/", "_").replace(".", "_")
        return self._client.get_or_create_collection(
            name=safe_name,
            metadata={"hnsw:space": "cosine"},
        )

    def list_collections(self) -> list[str]:
        """Return the names of all ChromaDB collections in the persistent store.

        Each name corresponds to a previously ingested repository.
        The raw ChromaDB collection names use underscores in place of slashes/dots.
        """
        try:
            return [col.name for col in self._client.list_collections()]
        except Exception as exc:
            logger.warning("list_collections failed: %s", exc)
            return []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def ingest_repository(
        self,
        repo_name: str,
        files: list[dict[str, str]],  # [{"path": "src/foo.py", "content": "..."}]
        gemini_api_key: str | None = None,
        openai_api_key: str | None = None,
    ) -> int:
        """Chunk, embed, and upsert all *files* into the repo's collection.

        Args:
            repo_name: Used as the ChromaDB collection name.
            files:     List of dicts with ``path`` and ``content`` keys.
            gemini_api_key: Optional custom Gemini API key.
            openai_api_key: Optional custom OpenAI API key.

        Returns:
            Total number of chunks upserted.
        """
        collection = self._collection(repo_name)
        total_upserted = 0

        for file_info in files:
            file_path: str = file_info.get("path", "unknown")
            content: str   = file_info.get("content", "")

            if not content.strip():
                continue

            chunks = _chunk_code(content)
            logger.info("Ingesting %s → %d chunk(s)", file_path, len(chunks))

            # Embed all chunks concurrently for this file
            embeddings: list[list[float]] = await asyncio.gather(
                *[get_embedding(chunk, gemini_api_key=gemini_api_key, openai_api_key=openai_api_key) for chunk in chunks]
            )

            ids       = [f"{file_path}::chunk_{i}" for i in range(len(chunks))]
            metadatas = [{"file_path": file_path, "chunk_index": i} for i in range(len(chunks))]

            collection.upsert(
                ids=ids,
                embeddings=embeddings,
                documents=chunks,
                metadatas=metadatas,
            )
            total_upserted += len(chunks)

        logger.info("Ingestion complete for '%s': %d total chunks.", repo_name, total_upserted)
        return total_upserted

    async def query_repository(
        self,
        repo_name: str,
        user_query: str,
        top_k: int = TOP_K,
        gemini_api_key: str | None = None,
        openai_api_key: str | None = None,
    ) -> list[dict[str, Any]]:
        """Semantically search the repo collection and return the top-k chunks.

        Args:
            repo_name:  The collection to search.
            user_query: The natural-language question or code fragment.
            top_k:      Number of results to return.
            gemini_api_key: Optional custom Gemini API key.
            openai_api_key: Optional custom OpenAI API key.

        Returns:
            A list of dicts, each containing ``document``, ``file_path``,
            ``chunk_index``, and ``distance``.
        """
        collection = self._collection(repo_name)
        query_embedding = await get_embedding(
            user_query,
            gemini_api_key=gemini_api_key,
            openai_api_key=openai_api_key,
        )

        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            include=["documents", "metadatas", "distances"],
        )

        output: list[dict[str, Any]] = []
        documents  = results.get("documents",  [[]])[0]
        metadatas  = results.get("metadatas",  [[]])[0]
        distances  = results.get("distances",  [[]])[0]

        for doc, meta, dist in zip(documents, metadatas, distances):
            output.append(
                {
                    "document":    doc,
                    "file_path":   meta.get("file_path", "unknown"),
                    "chunk_index": meta.get("chunk_index", 0),
                    "distance":    round(dist, 4),
                }
            )

        return output
