"""
Multi-model LLM factory for BugLens.

Each service implements two interfaces:
  - analyze_code()           → structured JSON dict (for /reviews/analyze)
  - stream_analysis()        → async generator of text tokens (for /reviews/stream)
  - stream_chat_with_context() → async generator of text tokens (for /chat/query RAG)

All AI calls use real provider SDKs with the keys from app.core.config.
"""

import json
import logging
from abc import ABC, abstractmethod
from typing import AsyncIterator

import httpx

from app.core.config import settings
from app.core.prompts import (
    CODE_REVIEW_SYSTEM_PROMPT,
    RAG_CHAT_SYSTEM_PROMPT,
    STREAMING_REVIEW_SYSTEM_PROMPT,
)

logger = logging.getLogger(__name__)

def _sanitize_error(exc: Exception, active_key: str | None = None) -> str:
    """Ensure API keys are never leaked into error messages."""
    import re
    msg = str(exc)
    keys_to_redact = [settings.GEMINI_API_KEY, settings.OPENAI_API_KEY, settings.ANTHROPIC_API_KEY]
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
# Lazy OpenAI client (avoids import errors if openai not installed)
# ---------------------------------------------------------------------------
def _openai_client():
    from openai import AsyncOpenAI
    return AsyncOpenAI(api_key=settings.OPENAI_API_KEY or "dummy-key")


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------
class LLMService(ABC):
    @abstractmethod
    async def analyze_code(self, code: str, language: str) -> dict:
        """Return structured review JSON."""

    @abstractmethod
    async def stream_analysis(self, code: str, language: str) -> AsyncIterator[str]:
        """Stream markdown review tokens."""

    async def stream_chat_with_context(
        self, augmented_prompt: str, language: str = "natural_language"
    ) -> AsyncIterator[str]:
        """Stream a RAG-augmented conversational answer.
        Default delegates to stream_analysis; providers can override."""
        async for token in self.stream_analysis(augmented_prompt, language):
            yield token


# ---------------------------------------------------------------------------
# OpenAI
# ---------------------------------------------------------------------------
class OpenAIService(LLMService):
    MODEL_CHAT  = "gpt-4o"
    MODEL_EMBED = "text-embedding-3-small"

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.OPENAI_API_KEY

    def _client(self):
        from openai import AsyncOpenAI
        return AsyncOpenAI(api_key=self.api_key or "dummy-key")

    async def analyze_code(self, code: str, language: str) -> dict:
        client = self._client()
        user_msg = f"Language: {language}\n\n```\n{code}\n```"
        try:
            resp = await client.chat.completions.create(
                model=self.MODEL_CHAT,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": CODE_REVIEW_SYSTEM_PROMPT},
                    {"role": "user",   "content": user_msg},
                ],
                temperature=0.2,
                max_tokens=1500,
            )
            raw = resp.choices[0].message.content or "{}"
            return json.loads(raw)
        except Exception as exc:
            logger.exception("OpenAI analyze_code failed")
            raise RuntimeError(f"OpenAI analyze_code error: {_sanitize_error(exc, self.api_key)}") from exc

    async def stream_analysis(self, code: str, language: str) -> AsyncIterator[str]:
        client = self._client()
        user_msg = f"Language: {language}\n\n```\n{code}\n```"
        try:
            stream = await client.chat.completions.create(
                model=self.MODEL_CHAT,
                messages=[
                    {"role": "system", "content": STREAMING_REVIEW_SYSTEM_PROMPT},
                    {"role": "user",   "content": user_msg},
                ],
                temperature=0.3,
                max_tokens=2000,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except Exception as exc:
            logger.exception("OpenAI stream_analysis failed")
            yield f"\n\n[Error: {_sanitize_error(exc, self.api_key)}]"

    async def stream_chat_with_context(
        self, augmented_prompt: str, language: str = "natural_language"
    ) -> AsyncIterator[str]:
        client = self._client()
        try:
            stream = await client.chat.completions.create(
                model=self.MODEL_CHAT,
                messages=[
                    {"role": "system", "content": RAG_CHAT_SYSTEM_PROMPT},
                    {"role": "user",   "content": augmented_prompt},
                ],
                temperature=0.4,
                max_tokens=2000,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except Exception as exc:
            logger.exception("OpenAI stream_chat_with_context failed")
            yield f"\n\n[Error: {_sanitize_error(exc, self.api_key)}]"


# ---------------------------------------------------------------------------
# Claude (Anthropic)
# ---------------------------------------------------------------------------
class ClaudeService(LLMService):
    API_URL = "https://api.anthropic.com/v1/messages"
    MODEL   = "claude-3-5-sonnet-20241022"

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.ANTHROPIC_API_KEY

    def _headers(self) -> dict:
        return {
            "x-api-key": self.api_key or "dummy-key",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

    async def analyze_code(self, code: str, language: str) -> dict:
        user_msg = f"Language: {language}\n\n```\n{code}\n```"
        payload = {
            "model": self.MODEL,
            "max_tokens": 1500,
            "system": CODE_REVIEW_SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": user_msg}],
        }
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(self.API_URL, headers=self._headers(), json=payload)
                resp.raise_for_status()
                raw = resp.json()["content"][0]["text"]
                return json.loads(raw)
        except Exception as exc:
            logger.exception("Claude analyze_code failed")
            raise RuntimeError(f"Claude analyze_code error: {_sanitize_error(exc, self.api_key)}") from exc

    async def stream_analysis(self, code: str, language: str) -> AsyncIterator[str]:
        user_msg = f"Language: {language}\n\n```\n{code}\n```"
        payload = {
            "model": self.MODEL,
            "max_tokens": 2000,
            "system": STREAMING_REVIEW_SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": user_msg}],
            "stream": True,
        }
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream("POST", self.API_URL, headers=self._headers(), json=payload) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data_str)
                                if chunk.get("type") == "content_block_delta":
                                    delta = chunk.get("delta", {}).get("text", "")
                                    if delta:
                                        yield delta
                            except json.JSONDecodeError:
                                continue
        except Exception as exc:
            logger.exception("Claude stream_analysis failed")
            yield f"\n\n[Error: {_sanitize_error(exc, self.api_key)}]"

    async def stream_chat_with_context(
        self, augmented_prompt: str, language: str = "natural_language"
    ) -> AsyncIterator[str]:
        payload = {
            "model": self.MODEL,
            "max_tokens": 2000,
            "system": RAG_CHAT_SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": augmented_prompt}],
            "stream": True,
        }
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream("POST", self.API_URL, headers=self._headers(), json=payload) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data_str)
                                if chunk.get("type") == "content_block_delta":
                                    delta = chunk.get("delta", {}).get("text", "")
                                    if delta:
                                        yield delta
                            except json.JSONDecodeError:
                                continue
        except Exception as exc:
            logger.exception("Claude stream_chat_with_context failed")
            yield f"\n\n[Error: {_sanitize_error(exc, self.api_key)}]"


# ---------------------------------------------------------------------------
# Gemini (via REST — google-generativeai SDK has poor async support)
# ---------------------------------------------------------------------------
class GeminiService(LLMService):
    BASE_URL  = "https://generativelanguage.googleapis.com/v1beta/models"
    MODEL     = "gemini-2.5-flash"

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.GEMINI_API_KEY

    def _generate_url(self, stream: bool = False) -> str:
        action = "streamGenerateContent" if stream else "generateContent"
        api_key = self.api_key or "dummy-key"
        if stream:
            return f"{self.BASE_URL}/{self.MODEL}:{action}?alt=sse&key={api_key}"
        return f"{self.BASE_URL}/{self.MODEL}:{action}?key={api_key}"

    def _build_payload(self, system_prompt: str, user_msg: str, max_tokens: int = 1500, json_mode: bool = False) -> dict:
        payload = {
            "system_instruction": {
                "parts": [{"text": system_prompt}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user_msg}]
                }
            ],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": max_tokens,
            }
        }
        if json_mode:
            payload["generationConfig"]["responseMimeType"] = "application/json"
        return payload

    def _extract_text_from_candidate(self, candidate: dict) -> str:
        """Extract streamed text from a Gemini REST API candidate object.

        The real Gemini streamGenerateContent response shape is:
            {"content": {"parts": [{"text": "..."}], "role": "model"}}
        """
        try:
            content = candidate.get("content", {})
            parts = content.get("parts", []) if isinstance(content, dict) else []
            return "".join(
                p.get("text", "") for p in parts if isinstance(p, dict)
            )
        except Exception:
            return ""

    async def analyze_code(self, code: str, language: str) -> dict:
        user_msg = f"Language: {language}\n\n```\n{code}\n```"
        # Increase max output tokens to 4096 to prevent truncation by reasoning/thinking models
        payload  = self._build_payload(CODE_REVIEW_SYSTEM_PROMPT, user_msg, max_tokens=4096, json_mode=True)
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(self._generate_url(stream=False), json=payload)
                resp.raise_for_status()
                raw_text = self._extract_text_from_candidate(resp.json().get("candidates", [{}])[0])
                
                # Clean markdown codeblocks/fences if present
                cleaned_text = raw_text.strip()
                if cleaned_text.startswith("```json"):
                    cleaned_text = cleaned_text[7:]
                elif cleaned_text.startswith("```"):
                    cleaned_text = cleaned_text[3:]
                if cleaned_text.endswith("```"):
                    cleaned_text = cleaned_text[:-3]
                cleaned_text = cleaned_text.strip()
                
                return json.loads(cleaned_text)
        except Exception as exc:
            logger.exception("Gemini analyze_code failed")
            raise RuntimeError(f"Gemini analyze_code error: {_sanitize_error(exc, self.api_key)}") from exc

    async def stream_analysis(self, code: str, language: str) -> AsyncIterator[str]:
        user_msg = f"Language: {language}\n\n```\n{code}\n```"
        payload  = self._build_payload(STREAMING_REVIEW_SYSTEM_PROMPT, user_msg, max_tokens=2000)
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream("POST", self._generate_url(stream=True), json=payload) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:]
                            try:
                                chunk = json.loads(data_str)
                                candidate = chunk.get("candidates", [{}])[0]
                                text = self._extract_text_from_candidate(candidate)
                                if text:
                                    yield text
                            except json.JSONDecodeError:
                                continue
        except Exception as exc:
            logger.exception("Gemini stream_analysis failed")
            yield f"\n\n[Error: {_sanitize_error(exc, self.api_key)}]"

    async def stream_chat_with_context(
        self, augmented_prompt: str, language: str = "natural_language"
    ) -> AsyncIterator[str]:
        payload = self._build_payload(RAG_CHAT_SYSTEM_PROMPT, augmented_prompt, max_tokens=2000)
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream("POST", self._generate_url(stream=True), json=payload) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:]
                            try:
                                chunk = json.loads(data_str)
                                candidate = chunk.get("candidates", [{}])[0]
                                text = self._extract_text_from_candidate(candidate)
                                if text:
                                    yield text
                            except json.JSONDecodeError:
                                continue
        except Exception as exc:
            logger.exception("Gemini stream_chat_with_context failed")
            yield f"\n\n[Error: {_sanitize_error(exc, self.api_key)}]"


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------
def get_llm_service(model_name: str, api_key: str | None = None) -> LLMService:
    """Return the correct LLMService for *model_name*.

    Accepted values (case-insensitive):
        openai, gpt-4o, gpt4  → OpenAIService
        claude, anthropic      → ClaudeService
        gemini, google         → GeminiService
    """
    key = model_name.lower()
    if key in ("openai", "gpt-4o", "gpt4", "gpt"):
        return OpenAIService(api_key=api_key)
    if key in ("claude", "anthropic", "claude-3-5"):
        return ClaudeService(api_key=api_key)
    if key in ("gemini", "google", "gemini-1.5", "gemini-2.5"):
        return GeminiService(api_key=api_key)
    logger.warning("Unknown model '%s', defaulting to OpenAI.", model_name)
    return OpenAIService(api_key=api_key)
