from pydantic import BaseModel, Field
from typing import Optional


class FilePayload(BaseModel):
    path: str = Field(..., description="Relative file path, e.g. 'src/utils/helpers.py'")
    content: str = Field(..., description="Raw source code content of the file")


class IngestRequest(BaseModel):
    repo_name: str = Field(..., description="Full repository identifier, e.g. 'owner/repo'")
    files: list[FilePayload] = Field(..., min_length=1, description="List of files to ingest")


class IngestResponse(BaseModel):
    repo_name: str
    chunks_upserted: int
    message: str


class ChatQueryRequest(BaseModel):
    repo_name: str = Field(..., description="Repository to query against")
    query: str = Field(..., description="Natural-language question about the codebase")
    preferred_model: str = Field("openai", description="LLM to use for the final answer")


class ContextChunk(BaseModel):
    file_path: str
    chunk_index: int
    distance: float
    document: str


class ChatQueryResponse(BaseModel):
    repo_name: str
    query: str
    context_chunks: list[ContextChunk]
    # The streaming answer is delivered via SSE; this is used for non-streaming responses.
    answer: Optional[str] = None
