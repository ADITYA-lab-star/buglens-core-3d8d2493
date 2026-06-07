import hashlib
import hmac
import json
import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request, status, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.db.mongo import get_mongo_db
from app.services.github_service import GitHubService
from app.services.llm_factory import get_llm_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _verify_signature(payload_bytes: bytes, signature_header: str | None, secret: str) -> None:
    """Verify the X-Hub-Signature-256 header from GitHub.

    Raises HTTP 401 if the signature is absent or invalid.
    """
    if not signature_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Hub-Signature-256 header.",
        )

    if not signature_header.startswith("sha256="):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed X-Hub-Signature-256 header.",
        )

    expected_digest = signature_header[len("sha256="):]
    computed_digest = hmac.new(
        secret.encode("utf-8"),
        payload_bytes,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed_digest, expected_digest):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Webhook signature verification failed.",
        )


def _build_review_comment(analysis: dict) -> str:
    """Format the LLM analysis dict as a GitHub PR comment in Markdown."""
    bugs = analysis.get("bugs", [])
    security = analysis.get("security_issues", [])
    perf = analysis.get("performance_tips", [])
    clean = analysis.get("clean_code_suggestions", [])
    severity = analysis.get("severity_level", "info").upper()

    def _bullet_list(items: list[str]) -> str:
        return "\n".join(f"- {item}" for item in items) if items else "_None found_"

    return f"""## 🤖 BugLens AI Review — Severity: `{severity}`

### 🐛 Bugs
{_bullet_list(bugs)}

### 🔐 Security Issues
{_bullet_list(security)}

### ⚡ Performance Tips
{_bullet_list(perf)}

### 🧹 Clean Code Suggestions
{_bullet_list(clean)}

---
*Powered by [BugLens](https://github.com) using the `{analysis.get("model", "AI")}` model.*
"""


import asyncio
from fastapi import BackgroundTasks

async def process_pr_review_background_task(
    repo_full_name: str,
    pull_number: int,
    github_access_token: str | None,
    gemini_api_key: str | None,
    openai_api_key: str | None,
):
    """Background task to fetch diff, analyze code with fallbacks, and post comment."""
    logger.info("Background task started for PR #%s in %s", pull_number, repo_full_name)
    
    github = GitHubService(access_token=github_access_token)
    try:
        diff_text: str = await github.get_pr_diff(repo_full_name, pull_number)
    except Exception as exc:
        logger.error("Failed to fetch PR diff: %s", exc)
        return

    if not diff_text.strip():
        logger.info("Empty diff for PR #%s — skipping review.", pull_number)
        return

    # Try Gemini first, fallback to OpenAI. Retry up to 3 times.
    models_to_try = [("gemini", gemini_api_key), ("openai", openai_api_key)]
    analysis = None
    
    for attempt in range(1, 4):
        for model_name, api_key in models_to_try:
            try:
                llm = get_llm_service(model_name, api_key=api_key)
                analysis = await llm.analyze_code(diff_text, language="diff")
                analysis["model"] = model_name
                logger.info("Successfully analyzed PR #%s using %s (Attempt %s)", pull_number, model_name, attempt)
                break
            except Exception as exc:
                logger.warning("LLM %s failed on attempt %s: %s", model_name, attempt, exc)
                
        if analysis:
            break
            
        if attempt < 3:
            logger.warning("All models failed on attempt %s. Retrying in 10s...", attempt)
            await asyncio.sleep(10)
            
    if not analysis:
        logger.error("Fatal: Background task failed to get AI review after all retries.")
        return

    comment_body = _build_review_comment(analysis)
    try:
        await github.post_pr_comment(repo_full_name, pull_number, comment_body)
        logger.info("Successfully posted AI review comment on PR #%s", pull_number)
    except Exception as exc:
        logger.error("Failed to post PR comment to GitHub: %s", exc)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/github", status_code=status.HTTP_202_ACCEPTED)
async def github_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    user_id: str | None = None,
    x_hub_signature_256: str | None = Header(default=None),
    x_github_event: str | None = Header(default=None),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
) -> dict:
    """Receive and process GitHub webhook events asynchronously.

    Security:
        Verifies the ``X-Hub-Signature-256`` header using HMAC-SHA256 before any processing.

    Handled events:
        - ``pull_request`` with action ``opened``, ``synchronize``, or ``reopened``:
            Queues a BackgroundTask to securely fetch the diff and analyze it with retries.
    """
    webhook_secret = settings.GITHUB_WEBHOOK_SECRET
    github_access_token = settings.GITHUB_ACCESS_TOKEN
    gemini_api_key = None
    openai_api_key = None

    if user_id:
        user_settings = await db.user_settings.find_one({"uid": user_id})
        if user_settings:
            webhook_secret = (
                user_settings.get("github_webhook_secret")
                or user_settings.get("webhook_secret")
                or webhook_secret
            )
            github_access_token = user_settings.get("github_access_token") or github_access_token
            gemini_api_key = user_settings.get("gemini_api_key") or None
            openai_api_key = user_settings.get("openai_api_key") or None
        else:
            logger.warning("No user settings found for user_id=%s.", user_id)

    payload_bytes: bytes = await request.body()
    _verify_signature(payload_bytes, x_hub_signature_256, webhook_secret)

    try:
        payload: dict[str, Any] = json.loads(payload_bytes)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.")

    if x_github_event != "pull_request":
        return {"status": "ignored", "reason": f"event '{x_github_event}' not handled"}

    action: str = payload.get("action", "")
    if action not in ("opened", "synchronize", "reopened"):
        return {"status": "ignored", "reason": f"action '{action}' not handled"}

    try:
        repo_full_name: str = payload["repository"]["full_name"]
        pull_number: int = payload["number"]
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=f"Missing expected field: {exc}")

    logger.info("Queueing PR #%s for background analysis...", pull_number)
    
    background_tasks.add_task(
        process_pr_review_background_task,
        repo_full_name=repo_full_name,
        pull_number=pull_number,
        github_access_token=github_access_token,
        gemini_api_key=gemini_api_key,
        openai_api_key=openai_api_key,
    )
    
    return {"status": "queued", "message": f"PR #{pull_number} review started in the background."}
