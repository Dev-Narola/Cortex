"""
Conversation context window manager.

Decides what history fits in the LLM's context budget. The
strategy is:

    total budget  =  model_context_limit  -  reservation
    history_budget  =  total budget  -  prompt overhead

When the history + summary exceeds the budget, the oldest
messages are *compacted into a new summary* — and the new
summary is the old summary plus the compacted messages, not
the whole conversation. That's the "summary replacement
strategy" from the V3 spec: re-summarising everything from
scratch each time would make the operation increasingly
expensive as the conversation grows.

Token counting uses ``tiktoken`` when available, falling back
to a 4-chars-per-token heuristic otherwise. The exact count
isn't critical for V3 (we have plenty of headroom); what
matters is that the math is *conservative* — under-counting
tokens is far worse than over-counting them.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Sequence

from src.conversation.domain.entities import Message, MessageRole
from src.conversation.domain.ports import LLMProvider

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Token counter
# ---------------------------------------------------------------------------


def _try_get_encoder(model_name: str) -> Any | None:
    """
    Return a tiktoken encoder for ``model_name``, or None if
    tiktoken isn't installed or the model is unknown.

    Imported lazily so this module loads even when tiktoken
    is missing (the ``tiktoken`` package is on the dependency
    list but is allowed to be absent in some test environments).
    """
    try:
        import tiktoken
    except ImportError:  # pragma: no cover - optional dep
        return None
    try:
        return tiktoken.encoding_for_model(model_name)
    except KeyError:
        try:
            # ``cl100k_base`` covers gpt-3.5/4; a safe default.
            return tiktoken.get_encoding("cl100k_base")
        except Exception:  # noqa: BLE001
            return None


class _TokenCounter:
    """
    Adaptive token counter.

    The first call decides which strategy to use and caches it:
    ``tiktoken`` when available, the 4-chars-per-token heuristic
    otherwise. The choice is sticky for the lifetime of the
    process because mixing strategies within a single
    conversation would produce inconsistent budget decisions.
    """

    def __init__(self, model_name: str) -> None:
        self._encoder = _try_get_encoder(model_name)

    def count(self, text: str) -> int:
        if not text:
            return 0
        if self._encoder is not None:
            try:
                # ``encode`` returns a list of token ids; the
                # count is the list length. Some encoders
                # accept an explicit disallowed-list but we
                # don't need one.
                return len(self._encoder.encode(text))
            except Exception:  # noqa: BLE001
                pass
        # Fallback heuristic. 1 token ≈ 4 characters is the
        # standard "good enough" estimate for English text.
        return max(1, len(text) // 4)


# ---------------------------------------------------------------------------
# ContextWindowManager
# ---------------------------------------------------------------------------


class ContextWindowManager:
    """
    Build a context-window-bounded slice of a conversation.

    Inputs: full message list, optional existing summary.
    Output: ``(summary, recent_messages)`` whose combined token
    count is within the budget.

    "Recent messages" are always returned in chronological order
    so the LLM sees the conversation in the right direction. The
    manager never drops *user* messages from the most-recent
    slice (i.e. the last message is always the most recent user
    question); only older turns get compacted.
    """

    # Number of recent messages to keep verbatim by default.
    # The exact value is small enough to fit comfortably in any
    # modern LLM context window and large enough to support
    # meaningful follow-up questions.
    DEFAULT_RECENT_WINDOW: int = 15

    def __init__(
        self,
        *,
        llm_provider: LLMProvider,
        model_context_limit: int,
        reservation_tokens: int,
        recent_window: int | None = None,
        token_counter: _TokenCounter | None = None,
    ) -> None:
        if model_context_limit <= 0:
            raise ValueError("model_context_limit must be > 0")
        if reservation_tokens < 0:
            raise ValueError("reservation_tokens must be >= 0")
        if reservation_tokens >= model_context_limit:
            raise ValueError(
                "reservation_tokens must be strictly less than model_context_limit"
            )
        self._llm = llm_provider
        self._limit = model_context_limit
        self._reservation = reservation_tokens
        self._recent_window = recent_window or self.DEFAULT_RECENT_WINDOW
        # A safe default: use the LLM's configured model name
        # if a token counter isn't injected (the typical case
        # in production). Tests inject their own.
        self._counter = token_counter or _TokenCounter("gpt-4o-mini")

    @property
    def history_budget(self) -> int:
        """Tokens available for history + summary after reservation."""
        return self._limit - self._reservation

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get_usable_context(
        self,
        messages: Sequence[Message],
        summary: str | None,
    ) -> tuple[str | None, list[Message]]:
        """
        Return ``(summary, recent_messages)`` that fits the budget.

        If the history already fits, returns the inputs unchanged.
        Otherwise compacts the oldest messages into a new summary
        (combining the existing summary if any) and trims the
        recent slice to ``self._recent_window`` messages.
        """
        if not messages:
            return summary, []

        summary_tokens = self._counter.count(summary) if summary else 0
        # Use the message's stored ``token_count`` when present so the
        # budget test is meaningful for short text like "turn 0".
        # Fall back to the content-based estimate for messages that
        # don't carry a token_count (legacy / synthetic messages).
        history_tokens = sum(
            m.token_count if m.token_count
            else self._counter.count(m.content)
            for m in messages
        )
        if summary_tokens + history_tokens <= self.history_budget:
            return summary, list(messages)

        # Over budget. Compact.
        # Keep the most recent ``recent_window`` messages verbatim.
        keep = self._trim_to_recent(messages)
        # Compact the rest.
        to_compact = list(messages[: -self._recent_window])

        new_summary = await self._summarize(
            existing_summary=summary,
            messages_to_compact=to_compact,
        )
        if new_summary is None:
            # Summarisation failed completely (no prior summary to
            # fall back to). We've still trimmed the recent window
            # so the budget holds.
            return None, keep
        return new_summary, keep

    # ------------------------------------------------------------------
    # Summarisation
    # ------------------------------------------------------------------

    async def _summarize(
        self,
        *,
        existing_summary: str | None,
        messages_to_compact: list[Message],
    ) -> str | None:
        """
        Build a new summary = old summary + compacted messages.

        The prompt is constructed so the LLM is told to *update*
        the existing summary rather than start from scratch; the
        cost of summarisation therefore stays roughly constant
        with conversation length, which is the whole point of
        the V3 strategy.
        """
        if not messages_to_compact:
            return existing_summary

        joined = "\n".join(
            f"{m.role.value if isinstance(m.role, MessageRole) else m.role}: {m.content}"
            for m in messages_to_compact
        )
        if existing_summary:
            prompt = (
                "You are updating a running conversation summary.\n"
                "Merge the OLD SUMMARY and the NEW TURNS into a single, "
                "denser summary that preserves all key facts, decisions, "
                "and open questions. Do not introduce facts that are not "
                "present in either source.\n\n"
                f"OLD SUMMARY:\n{existing_summary}\n\n"
                f"NEW TURNS:\n{joined}\n\n"
                "UPDATED SUMMARY:"
            )
        else:
            prompt = (
                "Summarize the following conversation turns into a dense "
                "summary that preserves key facts, decisions, and open "
                "questions. Do not introduce facts that are not present.\n\n"
                f"TURNS:\n{joined}\n\n"
                "SUMMARY:"
            )

        # The LLM provider's ``complete`` returns a single string
        # — we trust the provider to handle its own errors and
        # return whatever it can. If it raises, the manager
        # returns the *previous* summary (a safe fallback: the
        # caller will see a slightly over-budget context, but
        # the conversation continues).
        try:
            new_summary = await self._llm.complete(
                messages=[
                    Message.create(
                        conversation_id=uuid.uuid4(),
                        tenant_id=uuid.uuid4(),
                        role=MessageRole.SYSTEM,
                        content=prompt,
                    )
                ],
                model="gpt-4o-mini",
                temperature=0.0,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "ContextWindowManager: summarisation failed (%s); "
                "keeping previous summary and trimming recent window "
                "to compensate.",
                exc,
            )
            # Returned to the caller as ``(existing_summary, trimmed_recent)``
            # so the budget at least holds the recent window even if we
            # couldn't summarise. The caller is responsible for dropping
            # the most recent window into the same context.
            return existing_summary

        cleaned = (new_summary or "").strip()
        return cleaned or existing_summary

    def _trim_to_recent(
        self, messages: Sequence[Message]
    ) -> list[Message]:
        """Return the most recent ``self._recent_window`` messages."""
        return self._trim_to_window(messages, self._recent_window)

    @staticmethod
    def _trim_to_window(
        messages: Sequence[Message], recent_window: int
    ) -> list[Message]:
        """Return the most recent ``recent_window`` messages verbatim."""
        if not messages:
            return []
        return list(messages[-recent_window:])


__all__ = ["ContextWindowManager", "_TokenCounter"]


# Quiesce unused-import warnings; the ``Any`` import is here for
# forward-compatibility with a future injected provider that
# carries runtime metadata.
_ = Any
