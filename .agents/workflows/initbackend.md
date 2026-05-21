---
description: Scaffolds the complete FastAPI backend architecture for Buglens
---

1. Initialize a Python virtual environment and activate it.
2. Install the following dependencies: fastapi, uvicorn, sqlalchemy[asyncio], asyncpg, pydantic, pydantic-settings, python-dotenv, pyjwt, passlib[bcrypt], and httpx.
3. Generate a standard, scalable FastAPI folder structure (e.g., `app/api`, `app/core`, `app/db`, `app/models`, `app/services`).
4. Create a `.env.example` file including placeholders for `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GEMINI_API_KEY`.
5. Create `app/core/config.py` using Pydantic BaseSettings to load environment variables.
6. Set up the async SQLAlchemy database connection engine and session maker in `app/db/session.py`.
7. Create a basic `main.py` entry point with CORS middleware enabled for `http://localhost:5173` (or the Lovable frontend port) and a health-check endpoint at `/health`.
8. Run `uvicorn app.main:app --reload` to verify the server starts successfully.