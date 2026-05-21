from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "BugLens Backend"
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost/dbname"
    JWT_SECRET: str = "supersecretkey"
    
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str = ""

    GITHUB_WEBHOOK_SECRET: str = "your_webhook_secret"
    GITHUB_ACCESS_TOKEN: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
