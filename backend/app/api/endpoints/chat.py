import json
import logging
import re
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
    GitHubIngestRequest,
    IngestRequest,
    IngestResponse,
)
from app.services.github_service import GitHubService
from app.services.llm_factory import get_llm_service
from app.services.rag_service import MAX_FILES_FRONTEND, RAGService

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helper: parse a GitHub URL → "owner/repo"
# ---------------------------------------------------------------------------
_GITHUB_URL_RE = re.compile(
    r"https?://github\.com/([a-zA-Z0-9_.\-]+/[a-zA-Z0-9_.\-]+?)(?:\.git|/.*)?$"
)


def _parse_github_url(url: str) -> str | None:
    """Return 'owner/repo' from a GitHub URL, or None if invalid."""
    m = _GITHUB_URL_RE.match(url.strip())
    return m.group(1) if m else None


# ---------------------------------------------------------------------------
# Helper: build & stream a RAG SSE response
# ---------------------------------------------------------------------------
async def _rag_event_stream(
    body: ChatQueryRequest,
    db: AsyncIOMotorDatabase,
    uid: str,
    gemini_api_key: str | None = None,
    openai_api_key: str | None = None,
) -> AsyncIterator[str]:
    """Core SSE generator shared by /query and /repository.

    Yields:
        event: context  — JSON array of retrieved ContextChunks
        event: token    — individual LLM markdown tokens (json.dumps encoded)
        event: done     — empty terminator
        event: error    — on failure
    """
    rag = RAGService(db)

    # 1. Atlas Vector Search — scoped to this user's data
    try:
        raw_chunks = await rag.query_repository(
            body.repo_name,
            body.query,
            uid=uid,
            gemini_api_key=gemini_api_key,
            openai_api_key=openai_api_key,
        )
    except Exception as exc:
        logger.exception("Atlas vector search failed for '%s' (uid=%s)", body.repo_name, uid)
        yield f"event: error\ndata: Vector search failed: {exc}\n\n"
        yield "event: done\ndata: \n\n"
        return

    if not raw_chunks:
        yield (
            f"event: error\ndata: No indexed content found for repository "
            f"'{body.repo_name}'. Index it first using the '+ Index Repo' button.\n\n"
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
            # json.dumps produces a properly-escaped JSON string literal
            # (including embedded newlines, backslashes, etc.) that the
            # frontend can safely decode with JSON.parse().
            yield f"event: token\ndata: {json.dumps(token)}\n\n"
    except Exception as exc:
        logger.exception("LLM streaming failed (model=%s)", body.preferred_model)
        yield f"event: error\ndata: {str(exc)}\n\n"

    yield "event: done\ndata: \n\n"


# ---------------------------------------------------------------------------
# Helper: fetch all files from a GitHub repo and stream ingestion progress
# ---------------------------------------------------------------------------
async def _github_ingest_stream(
    body: GitHubIngestRequest,
    db: AsyncIOMotorDatabase,
    uid: str,
    gemini_api_key: str | None,
    openai_api_key: str | None,
) -> AsyncIterator[str]:
    """SSE generator for POST /ingest-github.

    Yields:
        event: progress — JSON with phase/fetched/total/file fields
        event: done     — JSON with chunks_upserted, repo_name, files_indexed
        event: error    — error message string
    """

    # 1. Validate and parse the GitHub URL
    repo_full_name = _parse_github_url(body.github_url)
    if not repo_full_name:
        yield (
            f"event: error\ndata: {json.dumps('Invalid GitHub URL. '
            'Expected format: https://github.com/owner/repo')}\n\n"
        )
        yield "event: done\ndata: \n\n"
        return

    repo_name = (body.repo_name or "").strip() or repo_full_name

    github = GitHubService()

    # 2. Fetch the file tree
    yield (
        f"event: progress\ndata: {json.dumps({'phase': 'fetching_tree', "
        f"'message': f'Fetching file tree for {repo_full_name}…'})}\n\n"
    )
    try:
        files_meta = await github.get_repo_tree(repo_full_name)
    except Exception as exc:
        yield f"event: error\ndata: {json.dumps(f'Failed to fetch repo tree: {exc}')}\n\n"
        yield "event: done\ndata: \n\n"
        return

    if not files_meta:
        yield f"event: error\ndata: {json.dumps('No indexable source files found in this repository.')}\n\n"
        yield "event: done\ndata: \n\n"
        return

    # Cap file count to avoid runaway embedding costs
    if len(files_meta) > MAX_FILES_FRONTEND:
        files_meta = files_meta[:MAX_FILES_FRONTEND]
        logger.info(
            "GitHub ingest capped at %d files for repo '%s' (uid=%s)",
            MAX_FILES_FRONTEND,
            repo_full_name,
            uid,
        )

    total_files = len(files_meta)
    yield (
        f"event: progress\ndata: {json.dumps({'phase': 'fetching_files', 'fetched': 0, "
        f"'total': total_files, 'message': f'Found {total_files} files to fetch'})}\n\n"
    )

    # 3. Fetch file contents one by one (streaming progress per file)
    files: list[dict] = []
    for i, meta in enumerate(files_meta):
        content = await github.get_file_content(repo_full_name, meta["sha"])
        if content and content.strip():
            files.append({"path": meta["path"], "content": content})

        yield (
            f"event: progress\ndata: {json.dumps({'phase': 'fetching_files', "
            f"'fetched': i + 1, 'total': total_files, 'file': meta['path']})}\n\n"
        )

    if not files:
        yield f"event: error\ndata: {json.dumps('Could not read any file contents from this repository.')}\n\n"
        yield "event: done\ndata: \n\n"
        return

    # 4. Chunk + batch-embed + store — stream progress from the RAG service
    rag = RAGService(db)
    total_chunks_upserted = 0

    async for event in rag.ingest_repository_streaming(
        repo_name,
        files,
        uid=uid,
        gemini_api_key=gemini_api_key,
        openai_api_key=openai_api_key,
    ):
        if event["type"] == "error":
            yield f"event: error\ndata: {json.dumps(event['message'])}\n\n"
            yield "event: done\ndata: \n\n"
            return
        elif event["type"] == "done":
            total_chunks_upserted = event["chunks_upserted"]
        elif event["type"] == "progress":
            yield f"event: progress\ndata: {json.dumps(event)}\n\n"

    yield (
        f"event: done\ndata: {json.dumps({'chunks_upserted': total_chunks_upserted, "
        f"'repo_name': repo_name, 'files_indexed': len(files)})}\n\n"
    )


# ---------------------------------------------------------------------------
# POST /ingest  — direct file ingestion (API / admin use)
# ---------------------------------------------------------------------------
@router.post("/ingest", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_repository(
    body: IngestRequest,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
    current_user: dict = Depends(get_firebase_user),
) -> IngestResponse:
    """Chunk, embed, and store a repository's source files in MongoDB (Atlas Vector Search)."""
    uid = current_user["uid"]
    user_settings = await db.user_settings.find_one({"uid": uid})
    gemini_api_key = None
    openai_api_key = None
    if user_settings:
        gemini_api_key = user_settings.get("gemini_api_key")
        openai_api_key = user_settings.get("openai_api_key")

    rag = RAGService(db)
    try:
        files_as_dicts = [f.model_dump() for f in body.files]
        chunks_upserted = await rag.ingest_repository(
            body.repo_name,
            files_as_dicts,
            uid=uid,
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
# POST /ingest-github  — frontend GitHub repo ingestion (SSE)
# ---------------------------------------------------------------------------
@router.post("/ingest-github")
async def ingest_github_repository(
    body: GitHubIngestRequest,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
    current_user: dict = Depends(get_firebase_user),
) -> StreamingResponse:
    """Fetch a GitHub repository by URL and ingest it for the authenticated user.

    Streams real-time progress via SSE so the frontend can show a live
    progress bar as files are fetched and embedded.

    SSE events emitted:
        progress — JSON with phase / fetched / total / file fields
        done     — JSON with chunks_upserted, repo_name, files_indexed
        error    — JSON-encoded error message string
    """
    uid = current_user["uid"]
    user_settings = await db.user_settings.find_one({"uid": uid})
    gemini_api_key = None
    openai_api_key = None
    if user_settings:
        gemini_api_key = user_settings.get("gemini_api_key")
        openai_api_key = user_settings.get("openai_api_key")

    return StreamingResponse(
        _github_ingest_stream(body, db, uid, gemini_api_key, openai_api_key),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# GET /collections  — list repos ingested by the current user
# ---------------------------------------------------------------------------
@router.get("/collections")
async def list_collections(
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
    current_user: dict = Depends(get_firebase_user),
) -> dict:
    """Return the names of all repositories ingested by the current user."""
    uid = current_user["uid"]
    rag = RAGService(db)
    try:
        collections = await rag.list_collections(uid=uid)
    except Exception as exc:
        logger.exception("Failed to list collections")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not list collections: {exc}",
        )
    return {"collections": collections}


# ---------------------------------------------------------------------------
# POST /query  — legacy SSE endpoint (backwards compat)
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
            body, db, uid,
            gemini_api_key=gemini_api_key,
            openai_api_key=openai_api_key,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# POST /repository  — primary SSE-streaming repo Q&A route
# ---------------------------------------------------------------------------
@router.post("/repository")
async def repository_chat(
    body: ChatQueryRequest,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
    current_user: dict = Depends(get_firebase_user),
) -> StreamingResponse:
    """Repository Q&A via MongoDB Atlas Vector Search + LLM streaming.

    Workflow:
        1. Embed the user query with Gemini gemini-embedding-001.
        2. Run $vectorSearch aggregation against the code_chunks collection,
           scoped to the authenticated user's data.
        3. Build a context-augmented prompt and stream the LLM answer as SSE.

    SSE events emitted:
        context — JSON array of ContextChunk dicts (sources)
        token   — one LLM markdown token (json.dumps encoded)
        done    — empty terminator
        error   — inline error message
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
            body, db, uid,
            gemini_api_key=gemini_api_key,
            openai_api_key=openai_api_key,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
