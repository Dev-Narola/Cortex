"""LLM reranker (audit H3): real reordering, flagged fallback, real usage."""

from __future__ import annotations

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.retrieval.application.query.rerank_service import RerankerService
from src.retrieval.domain.entities import SearchResult
from src.retrieval.infrastructure.reranker import LLMReranker, _parse_scores


def _r(content: str) -> SearchResult:
    return SearchResult(
        chunk_id=uuid.uuid4(),
        document_id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        content=content,
        score=0.5,
        source_type="fusion",
        fusion_score=0.5,
    )


def _llm(reply: str, usage=None):
    llm = MagicMock()
    llm.complete = AsyncMock(return_value=reply)
    llm.last_usage = usage
    llm.model = "judge"
    return llm


def test_reorders_by_llm_scores():
    docs = [_r("bananas"), _r("pgvector stores embeddings")]
    reranker = LLMReranker(_llm('{"scores": [{"id": 0, "score": 1}, {"id": 1, "score": 9}]}'))
    out = asyncio.run(reranker.rerank("where are vectors stored", docs))
    assert [d.content for d in out] == ["pgvector stores embeddings", "bananas"]
    assert out[0].rerank_score == pytest.approx(0.9)


def test_tolerates_prose_around_json_and_clamps():
    assert _parse_scores('Sure! {"scores":[{"id":0,"score":42}]} done', 1) == {0: 10.0}


@pytest.mark.parametrize("reply", ["no json here", '{"scores": [{"id": 0, "score": 3}]}'])
def test_service_falls_back_to_fused_order_and_flags(reply):
    docs = [_r("a"), _r("b")]
    service = RerankerService(LLMReranker(_llm(reply)))
    out = asyncio.run(service.rerank("q", docs))
    assert [d.content for d in out] == ["a", "b"]
    assert service.last_rerank_succeeded is False


def test_rerank_usage_is_billed_as_completion_with_real_tokens():
    billable = MagicMock()
    usage = {"prompt_tokens": 900, "completion_tokens": 40}
    reply = '{"scores": [{"id": 0, "score": 5}]}'
    service = RerankerService(LLMReranker(_llm(reply, usage=usage)), billable)
    tenant = uuid.uuid4()
    asyncio.run(service.rerank("q", [_r("a")], tenant_id=tenant))
    kwargs = billable.record_completion.call_args.kwargs
    assert (kwargs["input_tokens"], kwargs["output_tokens"]) == (900, 40)
    assert kwargs["operation"] == "rerank" and kwargs["tenant_id"] == tenant
    billable.record_rerank.assert_not_called()
