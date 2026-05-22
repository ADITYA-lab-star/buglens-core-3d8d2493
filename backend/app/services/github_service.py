import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

GITHUB_API_BASE = "https://api.github.com"


class GitHubService:
    """Async GitHub REST API client for PR diff extraction and commenting."""

    def __init__(self, access_token: str | None = None) -> None:
        token = access_token or settings.GITHUB_ACCESS_TOKEN
        self._headers = {
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        }

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
