import json
import logging
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.db.mongo import get_mongo_db
from app.api.dependencies.auth import get_firebase_user

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
# Helper: build & stream a RAG SSE response
# ---------------------------------------------------------------------------
async def _rag_event_stream(
    body: ChatQueryRequest,
    gemini_api_key: str | None = None,
    openai_api_key: str | None = None,
) -> AsyncIterator[str]:
    """Core SSE generator shared by /query and /repository.

    Yields:
        event: context  — JSON array of retrieved ContextChunks
        event: token    — individual LLM markdown tokens
        event: done     — empty terminator
        event: error    — on failure
    """
    # 1. Vector search
    try:
        raw_chunks = await _rag.query_repository(
            body.repo_name,
            body.query,
            gemini_api_key=gemini_api_key,
            openai_api_key=openai_api_key,
        )
    except Exception as exc:
        logger.exception("ChromaDB query failed for '%s'", body.repo_name)
        yield f"event: error\ndata: Vector search failed: {exc}\n\n"
        yield "event: done\ndata: \n\n"
        return

    if not raw_chunks:
        yield (
            f"event: error\ndata: No indexed content found for repository "
            f"'{body.repo_name}'. Run ingest.py first.\n\n"
        )
        yield "event: done\ndata: \n\n"
        return

    context_chunks = [ContextChunk(**c) for c in raw_chunks]

    # 2. Emit context metadata immediately so the UI can show sources
    context_payload = [c.model_dump() for c in context_chunks]
    yield f"event: context\ndata: {json.dumps(context_payload)}\n\n"

    # 3. Build augmented prompt
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

    # 4. Stream LLM tokens
    llm_api_key = None
    model_key = body.preferred_model.lower()
    if any(x in model_key for x in ("openai", "gpt-4o", "gpt4", "gpt")):
        llm_api_key = openai_api_key
    elif any(x in model_key for x in ("gemini", "google", "gemini-1.5", "gemini-2.5")):
        llm_api_key = gemini_api_key

    llm = get_llm_service(body.preferred_model, api_key=llm_api_key)
    try:
        async for token in llm.stream_chat_with_context(augmented_query):
            # Escape newlines so each SSE message stays on one line
            safe = token.replace("\\", "\\\\").replace("\n", "\\n")
            yield f"event: token\ndata: {safe}\n\n"
    except Exception as exc:
        logger.exception("LLM streaming failed (model=%s)", body.preferred_model)
        yield f"event: error\ndata: {str(exc)}\n\n"

    yield "event: done\ndata: \n\n"


# ---------------------------------------------------------------------------
# POST /ingest
# ---------------------------------------------------------------------------
@router.post("/ingest", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_repository(
    body: IngestRequest,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
    current_user: dict = Depends(get_firebase_user)
) -> IngestResponse:
    """Chunk, embed, and store a repository's source files in ChromaDB.

    Accepts a list of files (path + content) and upserts them into a
    collection named after ``repo_name``.  Safe to call repeatedly —
    existing chunks for the same file paths will be overwritten.
    """
    uid = current_user["uid"]
    user_settings = await db.user_settings.find_one({"uid": uid})
    gemini_api_key = None
    openai_api_key = None
    if user_settings:
        gemini_api_key = user_settings.get("gemini_api_key")
        openai_api_key = user_settings.get("openai_api_key")

    try:
        files_as_dicts = [f.model_dump() for f in body.files]
        chunks_upserted = await _rag.ingest_repository(
            body.repo_name,
            files_as_dicts,
            gemini_api_key=gemini_api_key,
            openai_api_key=openai_api_key,
        )
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
# GET /collections  — list all ingested repositories
# ---------------------------------------------------------------------------
@router.get("/collections")
async def list_collections(
    current_user: dict = Depends(get_firebase_user),
) -> dict:
    """Return the names of all ChromaDB collections (ingested repositories).

    The frontend uses this to populate the repo_name dropdown in the
    Repository Q&A tab without the user needing to remember exact names.

    Returns::

        {"collections": ["owner_my-repo", "another_project"]}
    """
    try:
        collections = _rag.list_collections()
    except Exception as exc:
        logger.exception("Failed to list ChromaDB collections")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not list collections: {exc}",
        )
    return {"collections": collections}


# ---------------------------------------------------------------------------
# POST /query  — legacy streaming SSE endpoint (kept for backwards compat)
# ---------------------------------------------------------------------------
@router.post("/query")
async def query_repository(
    body: ChatQueryRequest,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
    current_user: dict = Depends(get_firebase_user),
) -> StreamingResponse:
    """RAG-powered chat — legacy route. Prefer /repository for new clients."""
    uid = current_user["uid"]
    user_settings = await db.user_settings.find_one({"uid": uid})
    gemini_api_key = None
    openai_api_key = None
    if user_settings:
        gemini_api_key = user_settings.get("gemini_api_key")
        openai_api_key = user_settings.get("openai_api_key")

    return StreamingResponse(
        _rag_event_stream(
            body,
            gemini_api_key=gemini_api_key,
            openai_api_key=openai_api_key,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# POST /repository  — semantic, SSE-streaming repo Q&A (primary route)
# ---------------------------------------------------------------------------
@router.post("/repository")
async def repository_chat(
    body: ChatQueryRequest,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
    current_user: dict = Depends(get_firebase_user),
) -> StreamingResponse:
    """Repository Q&A via RAG + LLM streaming.

    Workflow:
        1. Embed the user's ``query`` with Gemini / OpenAI embeddings.
        2. Perform a cosine-similarity search in the ChromaDB collection
           named after ``repo_name``.
        3. Build a context-augmented prompt and stream the LLM answer back
           as Server-Sent Events.

    SSE events emitted:
        context — JSON array of ``ContextChunk`` dicts (sources)
        token   — one LLM markdown token
        done    — empty terminator
        error   — inline error message (no HTTP 4xx/5xx thrown)
    """
    uid = current_user["uid"]
    user_settings = await db.user_settings.find_one({"uid": uid})
    gemini_api_key = None
    openai_api_key = None
    if user_settings:
        gemini_api_key = user_settings.get("gemini_api_key")
        openai_api_key = user_settings.get("openai_api_key")

    return StreamingResponse(
        _rag_event_stream(
            body,
            gemini_api_key=gemini_api_key,
            openai_api_key=openai_api_key,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
