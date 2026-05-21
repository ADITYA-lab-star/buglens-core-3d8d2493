from sqlalchemy import Column, Integer, String, Text, JSON
from app.models.base import Base

class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    repository_name = Column(String)
    file_name = Column(String)
    code_snippet = Column(Text)
    ai_model_used = Column(String)
    review_result = Column(JSON)
    severity_level = Column(String)
