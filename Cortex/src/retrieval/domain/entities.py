import uuid
from dataclasses import dataclass, field
from typing import Any

@dataclass
class SearchResult:
    """
    A single chunk retrieved by a search query.
    Tracks individual component scores for debugging and reranking.
    """
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    tenant_id: uuid.UUID
    content: str
    score: float
    source_type: str  # e.g., "vector", "keyword", "fusion"
    document_title: str | None = None
    chunk_index: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)
    
    # Track scores separately for debugging and transparency
    vector_score: float = 0.0
    keyword_score: float = 0.0
    fusion_score: float = 0.0
    rerank_score: float = 0.0
