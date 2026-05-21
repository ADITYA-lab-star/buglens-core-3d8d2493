from pydantic import BaseModel
from typing import Optional, List

class ReviewRequest(BaseModel):
    code: str
    language: str
    preferred_model: str = "openai"
    repository_name: Optional[str] = None
    file_name: Optional[str] = None
    user_id: Optional[str] = None

class ReviewResponse(BaseModel):
    id: Optional[int] = None
    bugs: List[str] = []
    security_issues: List[str] = []
    performance_tips: List[str] = []
    clean_code_suggestions: List[str] = []
    severity_level: str = "info"
