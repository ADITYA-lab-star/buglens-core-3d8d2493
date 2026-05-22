"""
/api/v1/analyze — proactive, pre-commit snippet review endpoints.

POST /snippet  → streams an AI code review as Server-Sent Events.
"""

import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.schemas.review import ReviewRequest
from app.services.llm_factory import get_llm_service
from app.api.dependencies.auth import get_firebase_user

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/snippet")
async def analyze_snippet(
    request: ReviewRequest,
    current_user: dict = Depends(get_firebase_user),
) -> StreamingResponse:
    """Stream a real-time AI code review for a pasted snippet.

    Accepts the same ``ReviewRequest`` body as the reviews router.
    Emits Server-Sent Events so the browser can render tokens progressively.

    SSE event types:
        token  — one text chunk of the markdown review
        done   — stream finished (empty data field)
        error  — fatal error; data contains the human-readable message
    """
    llm = get_llm_service(request.preferred_model)

    async def _sse_generator():
        try:
            async for token in llm.stream_analysis(request.code, request.language):
                # Newlines inside the data field break the SSE framing —
                # escape them so each SSE message stays on a single line.
                safe_token = token.replace("\\", "\\\\").replace("\n", "\\n")
                yield f"event: token\ndata: {safe_token}\n\n"
        except Exception as exc:
            logger.exception(
                "SSE stream_analysis error (model=%s, user=%s)",
                request.preferred_model,
                current_user.get("uid", "unknown"),
            )
            yield f"event: error\ndata: {exc}\n\n"
        finally:
            yield "event: done\ndata: \n\n"

    return StreamingResponse(
        _sse_generator(),
        media_type="text/event-stream",
        headers={
            # Prevent any proxy / CDN from buffering the stream
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
