---
description: Generates the multi-model AI code review service and streaming API endpoints
---

1. Create a database model `Review` in `app/models/review.py` with fields: id, user_id, repository_name, file_name, code_snippet, ai_model_used, review_result (JSON), and severity_level.
2. Create Pydantic schemas in `app/schemas/review.py` for `ReviewRequest` (code, language, preferred_model) and `ReviewResponse`.
3. Create an interface factory in `app/services/llm_factory.py`. This should have a base class and implementations for `OpenAIService`, `ClaudeService`, and `GeminiService`. The service should take a code snippet and return a structured JSON response containing: bugs, security_issues, performance_tips, and clean_code_suggestions.
4. Create a system prompt constant in `app/core/prompts.py` that instructs the LLM to act as a brutal but helpful Senior Staff Engineer performing a PR review.
5. Create an API router in `app/api/endpoints/reviews.py`. 
6. Inside the router, create a `POST /api/v1/reviews/analyze` endpoint. This endpoint must accept a `ReviewRequest`, route it to the requested LLM service via the factory, save the result to the PostgreSQL database, and return the structured JSON.
7. (Bonus Step) Create a `POST /api/v1/reviews/stream` endpoint that uses FastAPI's `StreamingResponse` to stream the LLM output back to the client chunk-by-chunk for a ChatGPT-like typing effect.
8. Wire the router into `main.py`.