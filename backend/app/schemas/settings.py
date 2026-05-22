from pydantic import BaseModel
from typing import Optional

class UserSettingsResponse(BaseModel):
    webhook_secret: str
    github_access_token: str  # Will return masked if set
    openai_api_key: str      # Will return masked if set
    gemini_api_key: str      # Will return masked if set

class UserSettingsUpdate(BaseModel):
    github_access_token: Optional[str] = None
    openai_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
