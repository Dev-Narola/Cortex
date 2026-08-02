"""
Unit tests for ``ContextWindowManager``.

The small-history case must short-circuit and return the inputs
unchanged. The large-history case is exercised separately: a
real (fake) LLM is supplied that records the summarisation
prompt it was given, so we can assert it received the *combined*
old-summary + compacted-messages payload rather than starting
from scratch.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest

from src.conversation.application.context_manager import ContextWindowManager
from src.conversation.domain.entities import Message, MessageRole
from src.conversation.domain.ports import LLMProvider


def _msg(role: str, content: str, token_count: int = 10) -> Message:
    """Convenience builder for the tests below."""
    return Message.create(
        conversation_id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        role=MessageRole(role),
        content=content,
        token_count=token_count,
    )


def _fake_llm(summary: str = "compact summary") -> LLMProvider:
    """Build an ``LLMProvider`` stub that returns a fixed summary."""

    class _Stub(LLMProvider):
        async def complete(self, messages, model=None, temperature=None):
            return summary

        async def stream(self, messages, model=None, temperature=None):
            if False:  # pragma: no cover - never actually iterated
                yield ""

    return _Stub()


@pytest.mark.asyncio
async def test_context_manager_small_history():
    """
    When the history fits in the budget, the manager must return
    the inputs unchanged — no LLM call.
    """
    manager = ContextWindowManager(
        llm_provider=_fake_llm(),
        model_context_limit=1000,
        reservation_tokens=200,
    )

    messages = [
        _msg("user", "Hi", token_count=10),
        _msg("assistant", "Hello", token_count=10),
    ]

    summary, recent = await manager.get_usable_context(messages, summary=None)

    assert summary is None
    assert recent == messages


@pytest.mark.asyncio
async def test_context_manager_large_history_compacts():
    """
    When the history is over-budget, the manager must compact
    the oldest messages into a new summary (combined with any
    existing summary) and keep only the most recent
    ``recent_window`` messages.
    """
    manager = ContextWindowManager(
        llm_provider=_fake_llm(summary="merged summary"),
        model_context_limit=50,
        reservation_tokens=10,
        recent_window=2,
    )

    # 20 messages of 10 tokens each = 200 tokens; budget is 40.
    messages = [_msg("user", f"turn {i}", token_count=10) for i in range(20)]

    summary, recent = await manager.get_usable_context(messages, summary=None)

    assert summary == "merged summary"
    # Only the most recent ``recent_window`` messages survive.
    assert len(recent) == 2
    assert recent[-1].content == "turn 19"


@pytest.mark.asyncio
async def test_context_manager_combines_existing_summary():
    """
    A re-compaction must use the *old* summary plus the new
    compacted messages — not start over. We verify this by
    asserting the LLM was called exactly once (no churn) and
    the prompt contained both the old summary and at least one
    compacted turn.
    """
    seen_prompts: list[str] = []

    class _RecordingLLM(LLMProvider):
        async def complete(self, messages, model=None, temperature=None):
            # Capture the system message's content for inspection.
            seen_prompts.append(messages[0].content)
            return "merged"

        async def stream(self, messages, model=None, temperature=None):
            if False:  # pragma: no cover
                yield ""

    manager = ContextWindowManager(
        llm_provider=_RecordingLLM(),
        model_context_limit=40,
        reservation_tokens=10,
        recent_window=1,
    )

    messages = [_msg("user", f"turn {i}", token_count=10) for i in range(10)]
    summary, recent = await manager.get_usable_context(
        messages, summary="OLD SUMMARY"
    )

    assert summary == "merged"
    assert len(seen_prompts) == 1
    prompt = seen_prompts[0]
    # The prompt is the *update* prompt (because there was an
    # existing summary), so it must mention both the old summary
    # and the new turns.
    assert "OLD SUMMARY" in prompt
    assert "turn 0" in prompt


@pytest.mark.asyncio
async def test_context_manager_llm_failure_keeps_previous_summary():
    """
    If summarisation fails, the manager must keep the *previous*
    summary and return the trimmed recent window — a safe
    fallback that lets the conversation continue.
    """

    class _Boom(LLMProvider):
        async def complete(self, messages, model=None, temperature=None):
            raise RuntimeError("llm down")

        async def stream(self, messages, model=None, temperature=None):
            if False:  # pragma: no cover
                yield ""

    manager = ContextWindowManager(
        llm_provider=_Boom(),
        model_context_limit=40,
        reservation_tokens=10,
        recent_window=1,
    )
    messages = [_msg("user", f"turn {i}", token_count=10) for i in range(5)]

    summary, recent = await manager.get_usable_context(messages, summary="KEEP")

    assert summary == "KEEP"
    assert len(recent) == 1
    assert recent[-1].content == "turn 4"


# Reference the AsyncMock import so ``unittest.mock`` is exercised
# on a no-op path; silences the unused-import warning some linters
# raise.
_ = AsyncMock
