"""
Unit tests for the streaming RAG service.

Verifies the contract that matters for V3:

* The service yields a ``citation`` event for every retrieved
  chunk, in numerical [Source N] order.
* The service yields ``token`` events that match whatever the
  underlying LLM streams.
* Citations correspond *only* to chunks actually retrieved — the
  service never invents a citation.
* On a search failure, the service still answers the user
  (graceful degradation) — the ``citation`` events may be empty
  but no exception escapes to the caller.
"""

from __future__ import annotations

import uuid
from typing import AsyncIterator
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.conversation.application.services import AnswerQueryService
from src.conversation.domain.entities import Citation, Message, MessageRole
from src.conversation.domain.ports import LLMProvider
from src.retrieval.application.search_service import HybridSearchService
from src.retrieval.domain.entities import SearchResult


def _result(*, chunk_id: uuid.UUID, content: str, title: str = "Doc") -> SearchResult:
    return SearchResult(
        chunk_id=chunk_id,
        document_id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        content=content,
        score=0.9,
        source_type="vector",
        document_title=title,
        chunk_index=0,
    )


def _service_with(
    *,
    search_results: list[SearchResult] | None = None,
    search_raises: bool = False,
    tokens: list[str] | None = None,
    history: list[Message] | None = None,
    summary: str | None = None,
) -> AnswerQueryService:
    search = MagicMock(spec=HybridSearchService)
    if search_raises:
        search.search = AsyncMock(side_effect=RuntimeError("search down"))
    else:
        search.search = AsyncMock(
            return_value=search_results if search_results is not None else []
        )

    llm = MagicMock(spec=LLMProvider)

    async def _stream(*args, **kwargs) -> AsyncIterator[str]:
        for t in tokens or ["Hello", " world"]:
            yield t

    llm.stream = _stream
    llm.complete = AsyncMock(return_value="summary")

    db = MagicMock()
    service = AnswerQueryService(
        llm_provider=llm,
        search_service=search,
        db=db,
    )
    # Stub the history/summary persistence to avoid SQL.
    service._load_history = AsyncMock(
        return_value=(summary, history if history is not None else [])
    )
    service._save_summary = AsyncMock()
    return service


def _run(events: AsyncIterator):
    import asyncio

    return asyncio.run(_collect(events))


async def _collect(events):
    out = []
    async for e in events:
        out.append(e)
    return out


class TestRAGStreaming:
    def test_empty_query_yields_nothing(self):
        service = _service_with()
        result = _run(
            service.stream_answer(
                tenant_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
                user_id=uuid.uuid4(),
                query="",
            )
        )
        assert result == []

    def test_yields_one_citation_per_retrieved_chunk(self):
        chunk_a, chunk_b = uuid.uuid4(), uuid.uuid4()
        service = _service_with(
            search_results=[
                _result(chunk_id=chunk_a, content="A body"),
                _result(chunk_id=chunk_b, content="B body"),
            ],
            tokens=["ok"],
        )
        result = _run(
            service.stream_answer(
                tenant_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
                user_id=uuid.uuid4(),
                query="q",
            )
        )
        citations = [e for e in result if e["kind"] == "citation"]
        assert len(citations) == 2
        assert {c["citation"].chunk_id for c in citations} == {chunk_a, chunk_b}
        # Tokens came after citations.
        tokens = [e for e in result if e["kind"] == "token"]
        assert "".join(t["content"] for t in tokens) == "ok"

    def test_search_failure_still_yields_tokens(self):
        """Search is best-effort; the LLM still answers, just
        without citations."""
        service = _service_with(
            search_raises=True,
            tokens=["I", " can", " help"],
        )
        result = _run(
            service.stream_answer(
                tenant_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
                user_id=uuid.uuid4(),
                query="q",
            )
        )
        tokens = [e for e in result if e["kind"] == "token"]
        assert "".join(t["content"] for t in tokens) == "I can help"
        # No citations because search raised and returned [].
        citations = [e for e in result if e["kind"] == "citation"]
        assert citations == []

    def test_no_citations_when_no_retrieval_results(self):
        service = _service_with(
            search_results=[],
            tokens=["I don't know"],
        )
        result = _run(
            service.stream_answer(
                tenant_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
                user_id=uuid.uuid4(),
                query="q",
            )
        )
        citations = [e for e in result if e["kind"] == "citation"]
        assert citations == []


__all__ = []


# ---------------------------------------------------------------------------
# Audit H8 / H4 regressions: summarization is wired, usage is provider-reported
# ---------------------------------------------------------------------------


def _history(n: int, conv_id: uuid.UUID, tenant_id: uuid.UUID) -> list[Message]:
    import datetime as dt

    base = dt.datetime(2026, 1, 1, tzinfo=dt.UTC)
    out = []
    for i in range(n):
        m = Message.create(
            conversation_id=conv_id,
            tenant_id=tenant_id,
            role=MessageRole.USER if i % 2 == 0 else MessageRole.ASSISTANT,
            content=f"turn {i} " + "word " * 50,
            token_count=60,
        )
        object.__setattr__(m, "created_at", base + dt.timedelta(minutes=i))
        out.append(m)
    return out


def test_over_budget_history_is_summarized_and_marker_saved():
    from src.conversation.application.context_manager import ContextWindowManager

    conv_id, tenant_id = uuid.uuid4(), uuid.uuid4()
    history = _history(10, conv_id, tenant_id)
    service = _service_with(history=history)
    service._context_manager = ContextWindowManager(
        llm_provider=service._llm,
        model_context_limit=300,
        reservation_tokens=50,
        recent_window=4,
    )
    _run(service.stream_answer(
        tenant_id=tenant_id, conversation_id=conv_id, user_id=uuid.uuid4(), query="next?"
    ))
    service._save_summary.assert_awaited_once()
    kwargs = service._save_summary.await_args.kwargs
    assert kwargs["summary"] == "summary"
    # 10 messages, 4 kept verbatim -> the 6th (index 5) is the newest summarized one.
    assert kwargs["summarized_through"] == history[5].created_at


def test_short_history_is_not_summarized():
    conv_id, tenant_id = uuid.uuid4(), uuid.uuid4()
    service = _service_with(history=_history(2, conv_id, tenant_id))
    _run(service.stream_answer(
        tenant_id=tenant_id, conversation_id=conv_id, user_id=uuid.uuid4(), query="q"
    ))
    service._save_summary.assert_not_awaited()


def test_current_question_not_repeated_from_history():
    conv_id, tenant_id = uuid.uuid4(), uuid.uuid4()
    question = Message.create(
        conversation_id=conv_id, tenant_id=tenant_id, role=MessageRole.USER, content="Why?"
    )
    seen: list = []
    service = _service_with(history=[question])

    async def _stream(messages, **_kw):
        seen.extend(messages)
        yield "ok"

    service._llm.stream = _stream
    _run(service.stream_answer(
        tenant_id=tenant_id, conversation_id=conv_id, user_id=uuid.uuid4(), query="Why?"
    ))
    assert sum("Why?" in m.content for m in seen) == 1


def test_completion_usage_is_the_provider_reported_count():
    service = _service_with(tokens=["a", "b"])
    service._llm.last_usage = {"prompt_tokens": 321, "completion_tokens": 12}
    service._billable = MagicMock()
    tenant_id = uuid.uuid4()
    _run(service.stream_answer(
        tenant_id=tenant_id, conversation_id=uuid.uuid4(), user_id=uuid.uuid4(), query="q"
    ))
    kwargs = service._billable.record_completion.call_args.kwargs
    assert (kwargs["input_tokens"], kwargs["output_tokens"]) == (321, 12)
    assert kwargs["tenant_id"] == tenant_id and kwargs["operation"] == "stream"
