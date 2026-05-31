from pydantic import BaseModel
from typing import Optional


class UserSettingsResponse(BaseModel):
    webhook_secret: str
    github_webhook_secret: str        # 32-char hex for HMAC-SHA256 signature verification
    github_access_token: str          # Masked when set
    openai_api_key: str               # Masked when set
    gemini_api_key: str               # Masked when set


class UserSettingsUpdate(BaseModel):
    github_access_token: Optional[str] = None
    openai_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    github_webhook_secret: Optional[str] = None  # Allow user to rotate their own secret
