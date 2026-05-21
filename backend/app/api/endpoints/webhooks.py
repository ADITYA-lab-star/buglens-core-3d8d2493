import hashlib
import hmac
import json
import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request, status

from app.core.config import settings
from app.services.github_service import GitHubService
from app.services.llm_factory import get_llm_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _verify_signature(payload_bytes: bytes, signature_header: str | None) -> None:
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
        settings.GITHUB_WEBHOOK_SECRET.encode("utf-8"),
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


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/github", status_code=status.HTTP_204_NO_CONTENT)
async def github_webhook(
    request: Request,
    x_hub_signature_256: str | None = Header(default=None),
    x_github_event: str | None = Header(default=None),
) -> None:
    """Receive and process GitHub webhook events.

    Security:
        Verifies the ``X-Hub-Signature-256`` header using HMAC-SHA256 and the
        ``GITHUB_WEBHOOK_SECRET`` from the environment before any processing.

    Handled events:
        - ``pull_request`` with action ``opened`` or ``synchronize``:
            1. Fetches the PR diff via the GitHub REST API.
            2. Sends the diff to the configured LLM for a structured review.
            3. Posts the formatted review as a comment on the PR timeline.
    """
    # ---- 1. Read raw body for signature verification -----------------------
    payload_bytes: bytes = await request.body()
    _verify_signature(payload_bytes, x_hub_signature_256)

    # ---- 2. Parse payload ---------------------------------------------------
    try:
        payload: dict[str, Any] = json.loads(payload_bytes)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload.",
        )

    # ---- 3. Filter relevant events -----------------------------------------
    print(f"DEBUG: x_github_event={x_github_event}")
    if x_github_event != "pull_request":
        logger.info("Skipping non-pull_request event: %s", x_github_event)
        return  # 204 No Content — acknowledged but not processed

    action: str = payload.get("action", "")
    print(f"DEBUG: action={action}")
    if action not in ("opened", "synchronize", "reopened"):
        logger.info("Skipping pull_request action: %s", action)
        return

    # ---- 4. Extract PR metadata --------------------------------------------
    try:
        repo_full_name: str = payload["repository"]["full_name"]
        pull_number: int = payload["number"]
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Missing expected field in payload: {exc}",
        )

    logger.info(
        "Processing PR #%s for %s (action=%s)", pull_number, repo_full_name, action
    )

    # ---- 5. Fetch the PR diff ----------------------------------------------
    github = GitHubService()
    try:
        diff_text: str = await github.get_pr_diff(repo_full_name, pull_number)
    except Exception as exc:
        logger.error("Failed to fetch PR diff: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not fetch PR diff from GitHub: {exc}",
        )

    if not diff_text.strip():
        print(f"DEBUG: empty diff for PR {pull_number}")
        logger.info("Empty diff for PR #%s — skipping review.", pull_number)
        return
    else:
        print(f"DEBUG: diff length is {len(diff_text)}")

    # ---- 6. Run AI review on the diff --------------------------------------
    llm = get_llm_service("gemini")  # Using Gemini for PR webhook reviews
    try:
        analysis: dict = await llm.analyze_code(diff_text, language="diff")
        analysis["model"] = "gemini"
    except Exception as exc:
        logger.error("LLM analysis failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI review failed: {exc}",
        )

    # ---- 7. Post the review comment to GitHub ------------------------------
    comment_body = _build_review_comment(analysis)
    try:
        await github.post_pr_comment(repo_full_name, pull_number, comment_body)
        logger.info("Posted AI review comment on PR #%s", pull_number)
    except Exception as exc:
        logger.error("Failed to post PR comment: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not post review comment to GitHub: {exc}",
        )
