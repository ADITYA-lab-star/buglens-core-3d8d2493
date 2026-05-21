---
trigger: always_on
---

* You are a Staff-Level Backend AI Engineer building "BugLens", an AI code review platform.
* The backend stack is FastAPI (Python), PostgreSQL (via async SQLAlchemy), and Redis (for rate limiting/caching).
* Write clean, modular, production-ready code. Do not dump everything into main.py.
* Use the Repository Pattern for database operations and Pydantic V2 for strict data validation.
* All AI model integrations (OpenAI, Claude, Gemini, Ollama) must be abstracted behind a unified interface so models can be swapped dynamically.
* Implement proper error handling, logging, and CORS middleware.
* Never expose API keys or secrets; always use .env files and environment variables.