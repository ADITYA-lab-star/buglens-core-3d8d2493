import logging
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.schemas.chat import (
    ChatQueryRequest,
    ChatQueryResponse,
    ContextChunk,
    IngestRequest,
    IngestResponse,
)
from app.services.llm_factory import get_llm_service
from app.services.rag_service import RAGService

logger = logging.getLogger(__name__)

router = APIRouter()

# Shared RAGService instance (ChromaDB client is thread-safe)
_rag = RAGService()


# ---------------------------------------------------------------------------
# POST /ingest
# ---------------------------------------------------------------------------
@router.post("/ingest", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_repository(body: IngestRequest) -> IngestResponse:
    """Chunk, embed, and store a repository's source files in ChromaDB.

    Accepts a list of files (path + content) and upserts them into a
    collection named after ``repo_name``.  Safe to call repeatedly —
    existing chunks for the same file paths will be overwritten.
    """
    try:
        files_as_dicts = [f.model_dump() for f in body.files]
        chunks_upserted = await _rag.ingest_repository(body.repo_name, files_as_dicts)
    except Exception as exc:
        logger.exception("Ingestion failed for '%s'", body.repo_name)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion failed: {exc}",
        )

    return IngestResponse(
        repo_name=body.repo_name,
        chunks_upserted=chunks_upserted,
        message=f"Successfully ingested {len(body.files)} file(s) → {chunks_upserted} chunk(s).",
    )


# ---------------------------------------------------------------------------
# POST /query  — streaming SSE response
# ---------------------------------------------------------------------------
@router.post("/query")
async def query_repository(body: ChatQueryRequest) -> StreamingResponse:
    """RAG-powered chat endpoint.

    1. Embeds the user query and retrieves the top-5 relevant code chunks
       from ChromaDB.
    2. Builds a context-augmented prompt and streams the LLM's answer back
       as ``text/event-stream`` (Server-Sent Events).

    The SSE stream contains:
    - ``event: context`` — JSON array of retrieved chunks (sent first).
    - ``event: token``   — individual LLM tokens as they arrive.
    - ``event: done``    — empty data to signal stream end.
    """
    # ---- 1. Retrieve relevant chunks from ChromaDB -------------------------
    try:
        raw_chunks = await _rag.query_repository(body.repo_name, body.query)
    except Exception as exc:
        logger.exception("ChromaDB query failed for '%s'", body.repo_name)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Vector search failed: {exc}",
        )

    if not raw_chunks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No indexed content found for repository '{body.repo_name}'. Run /ingest first.",
        )

    context_chunks = [ContextChunk(**c) for c in raw_chunks]

    # ---- 2. Build augmented prompt -----------------------------------------
    context_block = "\n\n---\n\n".join(
        f"### {c.file_path} (chunk {c.chunk_index})\n```\n{c.document}\n```"
        for c in context_chunks
    )
    augmented_query = (
        f"Using the following code context from the '{body.repo_name}' repository, "
        f"answer the user's question in a helpful, concise way.\n\n"
        f"## Code Context\n{context_block}\n\n"
        f"## User Question\n{body.query}"
    )

    # ---- 3. Stream LLM response --------------------------------------------
    llm = get_llm_service(body.preferred_model)

    import json

    async def _event_stream() -> AsyncIterator[str]:
        # First: emit the retrieved context as a single SSE event so clients
        # can display source attribution immediately.
        context_payload = [c.model_dump() for c in context_chunks]
        yield f"event: context\ndata: {json.dumps(context_payload)}\n\n"

        # Then: stream LLM tokens
        try:
            async for token in llm.stream_analysis(augmented_query, language="natural_language"):
                yield f"event: token\ndata: {token}\n\n"
        except Exception as exc:
            logger.exception("LLM streaming failed")
            yield f"event: error\ndata: {str(exc)}\n\n"

        yield "event: done\ndata: \n\n"

    return StreamingResponse(_event_stream(), media_type="text/event-stream")
