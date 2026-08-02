"""Unit tests for the V3 ``RerankerService``.

Exercises the application's resilience contract: if the injected
``RerankerPort`` raises, the service must log and fall back to
the original document order so search is never taken down by a
flaky reranker. The contract is what V3 ships; a real cross-encoder
provider (V4) just plugs in via the same port.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest

from src.retrieval.application.query.rerank_service import RerankerService
from src.retrieval.domain.entities import SearchResult


def _make_doc(*, content: str, score: float, source_type: str = "fusion") -> SearchResult:
    return SearchResult(
        chunk_id=uuid.uuid4(),
        document_id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        content=content,
        score=score,
        source_type=source_type,
    )


@pytest.mark.asyncio
async def test_reranker_fallback_on_failure():
    """
    When the underlying port raises, the service must return the
    original document list (fused order) without raising.
    """
    mock_provider = AsyncMock()
    # The new service uses the ``RerankerPort.rerank`` method
    # directly (rather than the V2-era ``get_scores``). Configure
    # *that* method to raise so the fallback path is exercised.
    mock_provider.rerank.side_effect = Exception("Reranker down")

    reranker = RerankerService(mock_provider)
    docs = [_make_doc(content="A", score=0.9), _make_doc(content="B", score=0.8)]

    result = await reranker.rerank("query", docs)

    # Fallback contract: same documents, in the same order.
    assert result == docs
    # ``rerank_score`` is populated on every doc, even on the
    # fallback path — downstream consumers can always read it.
    assert all(d.rerank_score is not None for d in result)
    mock_provider.rerank.assert_awaited_once()


@pytest.mark.asyncio
async def test_reranker_returns_provider_order_on_success():
    """
    On a healthy reranker, the service must return whatever the
    port produced, in the port's order.
    """
    a, b, c = (
        _make_doc(content="A", score=0.9),
        _make_doc(content="B", score=0.8),
        _make_doc(content="C", score=0.7),
    )

    async def _fake_rerank(query: str, documents: list[SearchResult]) -> list[SearchResult]:
        # Reverse the order — the service should return this.
        return list(reversed(documents))

    mock_provider = AsyncMock()
    mock_provider.rerank.side_effect = _fake_rerank

    reranker = RerankerService(mock_provider)
    result = await reranker.rerank("query", [a, b, c])

    assert [r.content for r in result] == ["C", "B", "A"]


@pytest.mark.asyncio
async def test_reranker_handles_empty_input():
    """
    Empty input must short-circuit — no provider call, empty
    output, no errors. The service is called in the hot path and
    the empty case is the common one for cache hits.
    """
    mock_provider = AsyncMock()
    reranker = RerankerService(mock_provider)
    result = await reranker.rerank("query", [])
    assert result == []
    mock_provider.rerank.assert_not_called()

