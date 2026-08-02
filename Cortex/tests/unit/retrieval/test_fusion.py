import uuid
import pytest
from src.retrieval.application.query.reciprocal_rank_fusion import ReciprocalRankFusion
from src.retrieval.domain.entities import SearchResult

def test_rrf_ordering():
    # Define deterministic results (chunk IDs)
    chunk_a = uuid.uuid4()
    chunk_b = uuid.uuid4()
    chunk_c = uuid.uuid4()
    chunk_d = uuid.uuid4()

    vector_results = [
        SearchResult(chunk_id=chunk_a, document_id=uuid.uuid4(), tenant_id=uuid.uuid4(), content="A", score=0.9, source_type="vector"),
        SearchResult(chunk_id=chunk_b, document_id=uuid.uuid4(), tenant_id=uuid.uuid4(), content="B", score=0.8, source_type="vector"),
        SearchResult(chunk_id=chunk_c, document_id=uuid.uuid4(), tenant_id=uuid.uuid4(), content="C", score=0.7, source_type="vector"),
    ]
    keyword_results = [
        SearchResult(chunk_id=chunk_b, document_id=uuid.uuid4(), tenant_id=uuid.uuid4(), content="B", score=0.9, source_type="keyword"),
        SearchResult(chunk_id=chunk_d, document_id=uuid.uuid4(), tenant_id=uuid.uuid4(), content="D", score=0.8, source_type="keyword"),
        SearchResult(chunk_id=chunk_a, document_id=uuid.uuid4(), tenant_id=uuid.uuid4(), content="A", score=0.7, source_type="keyword"),
    ]

    fusion = ReciprocalRankFusion(k=60)
    fused = fusion.fuse(vector_results, keyword_results, limit=10)

    # Expected Ranking based on RRF:
    # Chunk B: Vector Rank 2 + Keyword Rank 1 -> 1/(60+2) + 1/(60+1)
    # Chunk A: Vector Rank 1 + Keyword Rank 3 -> 1/(60+1) + 1/(60+3)
    # ...
    
    # Assert top two are B and A
    assert fused[0].chunk_id == chunk_b
    assert fused[1].chunk_id == chunk_a

