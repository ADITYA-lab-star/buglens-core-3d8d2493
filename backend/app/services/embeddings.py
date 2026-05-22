"""
Embedding service for BugLens RAG.

Primary:  Google Gemini text-embedding-004 (768-dim)
Fallback: OpenAI text-embedding-3-small (1536-dim) — used only if Gemini key is absent.

Gemini embeddings are free-tier friendly and don't require a paid plan.
"""

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Gemini embedding (primary — free tier, no billing required)
# ---------------------------------------------------------------------------
GEMINI_EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models"
    "/gemini-embedding-2:embedContent?key={key}"
)


async def _get_gemini_embedding(text: str, api_key: str) -> list[float]:
    """Embed *text* using Gemini gemini-embedding-2 (3072 dimensions)."""
    url = GEMINI_EMBED_URL.format(key=api_key)
    payload = {
        "model": "models/gemini-embedding-2",
        "content": {"parts": [{"text": text.replace("\n", " ")}]},
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()["embedding"]["values"]


# ---------------------------------------------------------------------------
# OpenAI embedding (fallback)
# ---------------------------------------------------------------------------
async def _get_openai_embedding(text: str, api_key: str, model: str = "text-embedding-3-small") -> list[float]:
    """Embed *text* using OpenAI Embeddings API."""
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)
    text = text.replace("\n", " ")
    response = await client.embeddings.create(input=[text], model=model)
    return response.data[0].embedding


def _sanitize_error(exc: Exception, active_key: str | None = None) -> str:
    """Ensure API keys are never leaked into error messages."""
    import re
    msg = str(exc)
    keys_to_redact = [settings.GEMINI_API_KEY, settings.OPENAI_API_KEY]
    if active_key:
        keys_to_redact.append(active_key)
    for key in keys_to_redact:
        if key and len(key) > 5:
            msg = msg.replace(key, "***REDACTED***")
    # Redact common key patterns, including masked/partially-masked keys (e.g. sk-proj-******enai)
    patterns = [
        r"AIzaSy[a-zA-Z0-9\-_\*]{10,}",
        r"sk-(?:proj-)?[a-zA-Z0-9\-_\*]{10,}",
        r"sk-ant-[a-zA-Z0-9\-_\*]{10,}",
        r"gh[oprs]_[a-zA-Z0-9\-_\*]{10,}",
    ]
    for pattern in patterns:
        msg = re.sub(pattern, "***REDACTED***", msg)
    return msg


# ---------------------------------------------------------------------------
# Public interface — auto-selects provider based on available keys
# ---------------------------------------------------------------------------
async def get_embedding(
    text: str,
    gemini_api_key: str | None = None,
    openai_api_key: str | None = None,
) -> list[float]:
    """Return an embedding vector for *text*.

    Uses Gemini gemini-embedding-2 if a Gemini API key is available,
    otherwise falls back to OpenAI text-embedding-3-small.
    """
    g_key = gemini_api_key or settings.GEMINI_API_KEY
    o_key = openai_api_key or settings.OPENAI_API_KEY

    if g_key:
        try:
            return await _get_gemini_embedding(text, g_key)
        except Exception as exc:
            sanitized = _sanitize_error(exc, g_key)
            logger.warning("Gemini embedding failed (%s), trying OpenAI fallback.", sanitized)

    if o_key:
        try:
            return await _get_openai_embedding(text, o_key)
        except Exception as exc:
            sanitized = _sanitize_error(exc, o_key)
            raise RuntimeError(f"OpenAI embedding failed: {sanitized}") from exc

    raise RuntimeError(
        "No embedding provider available. Set GEMINI_API_KEY or OPENAI_API_KEY."
    )

