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
    "/text-embedding-004:embedContent?key={key}"
)


async def _get_gemini_embedding(text: str) -> list[float]:
    """Embed *text* using Gemini text-embedding-004 (768 dimensions)."""
    url = GEMINI_EMBED_URL.format(key=settings.GEMINI_API_KEY)
    payload = {
        "model": "models/text-embedding-004",
        "content": {"parts": [{"text": text.replace("\n", " ")}]},
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()["embedding"]["values"]


# ---------------------------------------------------------------------------
# OpenAI embedding (fallback)
# ---------------------------------------------------------------------------
async def _get_openai_embedding(text: str, model: str = "text-embedding-3-small") -> list[float]:
    """Embed *text* using OpenAI Embeddings API."""
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    text = text.replace("\n", " ")
    response = await client.embeddings.create(input=[text], model=model)
    return response.data[0].embedding


# ---------------------------------------------------------------------------
# Public interface — auto-selects provider based on available keys
# ---------------------------------------------------------------------------
async def get_embedding(text: str) -> list[float]:
    """Return an embedding vector for *text*.

    Uses Gemini text-embedding-004 if GEMINI_API_KEY is set,
    otherwise falls back to OpenAI text-embedding-3-small.
    """
    if settings.GEMINI_API_KEY:
        try:
            return await _get_gemini_embedding(text)
        except Exception as exc:
            logger.warning("Gemini embedding failed (%s), trying OpenAI fallback.", exc)

    if settings.OPENAI_API_KEY:
        return await _get_openai_embedding(text)

    raise RuntimeError(
        "No embedding provider available. Set GEMINI_API_KEY or OPENAI_API_KEY in .env"
    )
