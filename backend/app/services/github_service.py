import logging
import os
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

GITHUB_API_BASE = "https://api.github.com"

# ---------------------------------------------------------------------------
# Files/directories to skip during GitHub tree ingestion
# ---------------------------------------------------------------------------
_IGNORED_DIRS: set[str] = {
    ".git", "node_modules", "venv", "__pycache__", ".next",
    "dist", "build", ".tanstack", ".chroma_db", "coverage",
    ".wrangler", ".vinxi", ".nitro", "dataconnect", ".tox",
    ".mypy_cache", ".pytest_cache", "eggs", ".eggs",
}

_IGNORED_EXTENSIONS: set[str] = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".zip",
    ".woff", ".woff2", ".ttf", ".eot", ".otf", ".mp4", ".webp",
    ".svg", ".lock", ".map", ".pyc", ".pyo", ".class",
    ".jar", ".war", ".ear", ".so", ".dll", ".exe", ".bin",
    ".parquet", ".pkl", ".h5", ".pb",
}

_MAX_FILE_BYTES = 150_000


class GitHubService:
    """Async GitHub REST API client for PR diff extraction and repository ingestion."""

    def __init__(self, access_token: str | None = None) -> None:
        token = access_token or settings.GITHUB_ACCESS_TOKEN
        self._headers = {
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    # ------------------------------------------------------------------
    # Existing: PR diff / comment
    # ------------------------------------------------------------------

    async def get_pr_diff(self, repo_full_name: str, pull_number: int) -> str:
        """Fetch the raw unified diff of a Pull Request.

        Args:
            repo_full_name: e.g. "owner/repo"
            pull_number: The PR number.

        Returns:
            The raw diff string.
        """
        url = f"{GITHUB_API_BASE}/repos/{repo_full_name}/pulls/{pull_number}"
        headers = {**self._headers, "Accept": "application/vnd.github.v3.diff"}

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.text

    async def post_pr_comment(
        self, repo_full_name: str, pull_number: int, comment_body: str
    ) -> dict:
        """Post a markdown comment to a PR's timeline.

        Args:
            repo_full_name: e.g. "owner/repo"
            pull_number: The PR number.
            comment_body: The markdown comment to post.

        Returns:
            The GitHub API response JSON.
        """
        url = f"{GITHUB_API_BASE}/repos/{repo_full_name}/issues/{pull_number}/comments"
        headers = {**self._headers, "Accept": "application/vnd.github+json"}
        payload = {"body": comment_body}

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()

    # ------------------------------------------------------------------
    # New: Repository tree ingestion helpers
    # ------------------------------------------------------------------

    async def get_repo_tree(
        self, repo_full_name: str, branch: str = "main"
    ) -> list[dict]:
        """Fetch the complete recursive file tree for a GitHub repository.

        Tries *branch* first (default "main"), falls back to "master" on 404.

        Returns
        -------
        List of dicts: ``{"path": str, "sha": str, "size": int}``
        — filtered to indexable source files only.
        """
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            for attempt_branch in (branch, "master", "main"):
                url = (
                    f"{GITHUB_API_BASE}/repos/{repo_full_name}/git/trees/"
                    f"{attempt_branch}?recursive=1"
                )
                resp = await client.get(url, headers=self._headers)
                if resp.status_code == 200:
                    break
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
            else:
                raise RuntimeError(
                    f"Could not fetch tree for '{repo_full_name}' "
                    f"(tried branches: {branch}, master, main)."
                )

        data = resp.json()
        if data.get("truncated"):
            logger.warning(
                "GitHub tree response for '%s' is truncated — very large repo.",
                repo_full_name,
            )

        indexable: list[dict] = []
        for item in data.get("tree", []):
            if item.get("type") != "blob":
                continue

            path: str = item["path"]

            # Skip if any path segment belongs to an ignored directory
            parts = path.split("/")
            if any(p in _IGNORED_DIRS for p in parts[:-1]):
                continue

            # Skip ignored extensions
            ext = os.path.splitext(path)[1].lower()
            if ext in _IGNORED_EXTENSIONS:
                continue

            # Skip files that are too large
            if item.get("size", 0) > _MAX_FILE_BYTES:
                continue

            indexable.append(
                {"path": path, "sha": item["sha"], "size": item.get("size", 0)}
            )

        return indexable

    async def get_file_content(self, repo_full_name: str, sha: str) -> str | None:
        """Fetch a file's raw text content by its Git blob SHA.

        Uses ``application/vnd.github.raw+json`` so GitHub returns the raw
        bytes directly — no base64 decoding needed.

        Returns ``None`` on any failure (binary file, network error, etc.).
        """
        url = f"{GITHUB_API_BASE}/repos/{repo_full_name}/git/blobs/{sha}"
        headers = {**self._headers, "Accept": "application/vnd.github.raw+json"}

        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code != 200:
                    return None
                # Attempt to decode as UTF-8 text; skip binary files
                return resp.content.decode("utf-8", errors="strict")
        except (UnicodeDecodeError, Exception) as exc:
            logger.debug("Skipping file sha=%s: %s", sha, exc)
            return None
