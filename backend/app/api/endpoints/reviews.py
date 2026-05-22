import logging

import re
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.db.mongo import get_mongo_db
from app.schemas.review import ReviewRequest, ReviewResponse, PRReviewRequest
from app.services.llm_factory import get_llm_service
from app.api.dependencies.auth import get_firebase_user

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/analyze", response_model=ReviewResponse)
async def analyze_code(
    request: ReviewRequest, 
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
    current_user: dict = Depends(get_firebase_user)
):
    """Perform a full structured AI review and persist the result to the database.

    Returns a structured JSON response containing bugs, security_issues,
    performance_tips, clean_code_suggestions, and severity_level.
    """
    uid = current_user["uid"]
    user_settings = await db.user_settings.find_one({"uid": uid})
    
    api_key = None
    if user_settings:
        model_key = request.preferred_model.lower()
        if any(x in model_key for x in ("openai", "gpt-4o", "gpt4", "gpt")):
            api_key = user_settings.get("openai_api_key")
        elif any(x in model_key for x in ("gemini", "google", "gemini-1.5", "gemini-2.5")):
            api_key = user_settings.get("gemini_api_key")

    llm = get_llm_service(request.preferred_model, api_key=api_key)

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
        review_data = {
            "uid": current_user["uid"],
            "repository_name": request.repository_name or "unknown",
            "file_name": request.file_name or "unknown",
            "code_snippet": request.code,
            "ai_model_used": request.preferred_model,
            "metadataJson": analysis,
            "severity_level": severity,
            "status": "completed",
            "language": request.language,
        }
        result = await db.reviews.insert_one(review_data)
        review_id = str(result.inserted_id)
    except Exception as exc:
        # DB failure should NOT block returning the review to the client
        logger.error("Failed to persist review to database: %s", exc)
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
async def stream_review(
    request: ReviewRequest,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
    current_user: dict = Depends(get_firebase_user)
) -> StreamingResponse:
    """Stream an AI code review as Server-Sent Events (text/event-stream).

    Each SSE event carries a raw markdown token. The client accumulates
    tokens in real-time to produce a typing effect.

    Event types emitted:
        token  — a chunk of the markdown review
        done   — signals end of stream (empty data)
        error  — fatal error; data contains the message
    """
    uid = current_user["uid"]
    user_settings = await db.user_settings.find_one({"uid": uid})
    
    api_key = None
    if user_settings:
        model_key = request.preferred_model.lower()
        if any(x in model_key for x in ("openai", "gpt-4o", "gpt4", "gpt")):
            api_key = user_settings.get("openai_api_key")
        elif any(x in model_key for x in ("gemini", "google", "gemini-1.5", "gemini-2.5")):
            api_key = user_settings.get("gemini_api_key")

    llm = get_llm_service(request.preferred_model, api_key=api_key)

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


@router.post("/analyze/pr", response_model=ReviewResponse)
async def analyze_pr(
    request: PRReviewRequest,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
    current_user: dict = Depends(get_firebase_user)
):
    """Fetch raw diff of a GitHub PR and run structured AI review."""
    # 1. Parse URL
    pattern = r"github\.com/([^/]+)/([^/]+)/pull/([0-9]+)"
    match = re.search(pattern, request.pr_url)
    if not match:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid GitHub PR URL. Expected format: https://github.com/owner/repo/pull/number"
        )
    owner, repo, pull_number = match.groups()

    uid = current_user["uid"]
    user_settings = await db.user_settings.find_one({"uid": uid})

    github_access_token = settings.GITHUB_ACCESS_TOKEN
    if user_settings and user_settings.get("github_access_token"):
        github_access_token = user_settings.get("github_access_token")

    # 2. Make authenticated request to GitHub API to fetch raw .diff
    headers = {
        "Accept": "application/vnd.github.v3.diff",
    }
    if github_access_token:
        headers["Authorization"] = f"Bearer {github_access_token}"

    async with httpx.AsyncClient(timeout=30) as client:
        url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}"
        try:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 404:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="GitHub Pull Request not found or access denied."
                )
            resp.raise_for_status()
            diff_content = resp.text
        except httpx.HTTPStatusError as exc:
            logger.exception("GitHub API error: %s", exc)
            raise HTTPException(
                status_code=exc.response.status_code,
                detail=f"GitHub API error: {exc.response.text}"
            )
        except Exception as exc:
            logger.exception("Failed to fetch PR diff: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to fetch PR diff: {exc}"
            )

    if not diff_content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The PR diff is empty."
        )

    api_key = None
    if user_settings:
        model_key = request.preferred_model.lower()
        if any(x in model_key for x in ("openai", "gpt-4o", "gpt4", "gpt")):
            api_key = user_settings.get("openai_api_key")
        elif any(x in model_key for x in ("gemini", "google", "gemini-1.5", "gemini-2.5")):
            api_key = user_settings.get("gemini_api_key")

    # 3. Pass raw diff string to existing LLM review function
    llm = get_llm_service(request.preferred_model, api_key=api_key)
    try:
        analysis: dict = await llm.analyze_code(diff_content, "diff")
    except Exception as exc:
        logger.exception("LLM analyze_code failed for PR diff (model=%s)", request.preferred_model)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI analysis failed: {exc}",
        )

    bugs = analysis.get("bugs", [])
    security = analysis.get("security_issues", [])
    perf = analysis.get("performance_tips", [])
    clean = analysis.get("clean_code_suggestions", [])
    severity = analysis.get("severity_level", "info")

    # 4. Persist to MongoDB database
    try:
        review_data = {
            "uid": current_user["uid"],
            "repository_name": f"{owner}/{repo}",
            "file_name": f"PR #{pull_number} Diff",
            "code_snippet": diff_content[:10000],  # store first 10k chars to fit safely
            "ai_model_used": request.preferred_model,
            "metadataJson": analysis,
            "severity_level": severity,
            "status": "completed",
            "language": "diff",
        }
        result = await db.reviews.insert_one(review_data)
        review_id = str(result.inserted_id)
    except Exception as exc:
        logger.error("Failed to persist PR review to database: %s", exc)
        review_id = None

    return ReviewResponse(
        id=review_id,
        bugs=bugs,
        security_issues=security,
        performance_tips=perf,
        clean_code_suggestions=clean,
        severity_level=severity,
    )
