import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.review import Review
from app.schemas.review import ReviewRequest, ReviewResponse
from app.services.llm_factory import get_llm_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/analyze", response_model=ReviewResponse)
async def analyze_code(request: ReviewRequest, db: AsyncSession = Depends(get_db)):
    """Perform a full structured AI review and persist the result to the database.

    Returns a structured JSON response containing bugs, security_issues,
    performance_tips, clean_code_suggestions, and severity_level.
    """
    llm = get_llm_service(request.preferred_model)

    try:
        analysis: dict = await llm.analyze_code(request.code, request.language)
    except Exception as exc:
        logger.exception("LLM analyze_code failed (model=%s)", request.preferred_model)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI analysis failed: {exc}",
        )

    # Validate expected keys are present (LLM may hallucinate missing fields)
    bugs          = analysis.get("bugs", [])
    security      = analysis.get("security_issues", [])
    perf          = analysis.get("performance_tips", [])
    clean         = analysis.get("clean_code_suggestions", [])
    severity      = analysis.get("severity_level", "info")

    # Persist to database
    try:
        new_review = Review(
            user_id          = request.user_id or "anonymous",
            repository_name  = request.repository_name or "unknown",
            file_name        = request.file_name or "unknown",
            code_snippet     = request.code,
            ai_model_used    = request.preferred_model,
            review_result    = analysis,
            severity_level   = severity,
        )
        db.add(new_review)
        await db.commit()
        await db.refresh(new_review)
        review_id = new_review.id
    except Exception as exc:
        # DB failure should NOT block returning the review to the client
        logger.error("Failed to persist review to database: %s", exc)
        await db.rollback()
        review_id = None

    return ReviewResponse(
        id                    = review_id,
        bugs                  = bugs,
        security_issues       = security,
        performance_tips      = perf,
        clean_code_suggestions= clean,
        severity_level        = severity,
    )


@router.post("/stream")
async def stream_review(request: ReviewRequest) -> StreamingResponse:
    """Stream an AI code review as Server-Sent Events (text/event-stream).

    Each SSE event carries a raw markdown token. The client accumulates
    tokens in real-time to produce a typing effect.

    Event types emitted:
        token  — a chunk of the markdown review
        done   — signals end of stream (empty data)
        error  — fatal error; data contains the message
    """
    llm = get_llm_service(request.preferred_model)

    async def _sse_generator():
        try:
            async for token in llm.stream_analysis(request.code, request.language):
                # Escape newlines so the SSE data field stays on one line
                safe = token.replace("\n", "\\n")
                yield f"event: token\ndata: {safe}\n\n"
        except Exception as exc:
            logger.exception("SSE stream_analysis error")
            yield f"event: error\ndata: {exc}\n\n"
        finally:
            yield "event: done\ndata: \n\n"

    return StreamingResponse(_sse_generator(), media_type="text/event-stream")
