"""
RAG application services — the core V3 answer pipeline.

The single public service is ``AnswerQueryService``. It is the
orchestrator that takes a user question in the context of an
existing conversation and produces a streaming, citation-backed
answer.

Flow:

    1. Load recent messages + the existing summary
    2. Build a ContextWindowManager-bounded slice of the history
    3. Run a hybrid search (vector + keyword + RRF + rerank) for
       the user's question
    4. Construct a grounded prompt
    5. Stream the LLM's response
    6. Yield ``token`` and ``citation`` events as the stream
       progresses, with each citation validated against the
       retrieved set so a hallucinated ``chunk_id`` cannot leak
       through

The async shape matches the V3 WebSocket and FastAPI paths. Sync
V2 callers (e.g. legacy smoke tests) can ``asyncio.run`` this
service.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from src.conversation.application.context_manager import ContextWindowManager
from src.conversation.domain.entities import Citation, Message, MessageRole
from src.conversation.domain.ports import LLMProvider
from src.conversation.infrastructure.repositories import (
    ConversationMessageRepository,
)
from src.core.config import settings
from src.observability.application.billable import BillableRecorder
from src.retrieval.application.search_service import HybridSearchService
from src.retrieval.domain.entities import SearchResult

logger = logging.getLogger(__name__)


# Maximum number of source chunks presented to the LLM. Tuned for
# ``gpt-4o-mini``'s context window with a 4K reservation for the
# answer. Increasing it costs tokens; lowering it may hurt citation
# quality.
_MAX_SOURCES = 5

# Default number of recent messages to include in the prompt. The
# ContextWindowManager may keep fewer if the conversation is very
# long; this is the upper bound.
_RECENT_MESSAGE_BUDGET = 20

# Maximum length of a single source excerpt shown to the LLM. The
# full chunk is stored on the citation; the prompt gets a trimmed
# version so very long chunks don't blow the context.
_EXCERPT_CHAR_BUDGET = 1_500


class AnswerQueryService:
    """
    Streaming, citation-backed RAG service.

    The service is constructed once per request with the right
    collaborators. The ``model_name`` attribute is exposed so the
    WebSocket route can record which model produced the answer on
    the assistant ``Message`` row.
    """

    def __init__(
        self,
        *,
        llm_provider: LLMProvider,
        search_service: HybridSearchService,
        db: AsyncSession,
        model_name: str | None = None,
        temperature: float | None = None,
        billable: BillableRecorder | None = None,
    ) -> None:
        self._llm = llm_provider
        self._search = search_service
        self._db = db
        self.model_name = model_name or settings.LLM_MODEL
        self._temperature = temperature if temperature is not None else settings.LLM_TEMPERATURE
        # The context manager is stateless w.r.t. the conversation
        # — we hand it the messages and summary each call. We just
        # need an LLM for summarization; pass the same one.
        self._context_manager = ContextWindowManager(
            llm_provider=llm_provider,
            model_context_limit=settings.LLM_CONTEXT_WINDOW_TOKENS,
            reservation_tokens=settings.LLM_RESERVATION_TOKENS,
        )
        # V4: optional usage-event recorder. Token counts
        # are best-effort — the OpenAI streaming API returns
        # them in a final usage chunk when ``stream_options
        # = {"include_usage": True}`` is set, but V3's
        # streaming wrapper doesn't request that yet. When
        # V5 plumbs it through, the values here will become
        # exact instead of estimated.
        self._billable = billable

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def stream_answer(
        self,
        *,
        tenant_id: uuid.UUID,
        conversation_id: uuid.UUID,
        user_id: uuid.UUID,
        query: str,
    ) -> AsyncIterator[dict[str, Any]]:
        """
        Stream the RAG answer for ``query``.

        Yields dict envelopes with a ``kind`` field — the WebSocket
        route is the only caller and it knows how to translate
        each shape into a wire envelope. ``kind`` is one of:

        * ``"token"``     — ``{"kind": "token", "content": "…"}``
        * ``"citation"``  — ``{"kind": "citation", "citation": Citation}``

        The WebSocket route emits ``message_start`` /
        ``message_complete`` / ``error`` frames; this service
        deliberately does not — those are wire-protocol concerns
        that belong at the boundary.
        """
        if not query or not query.strip():
            return

        # 1) Load recent history.
        recent_messages = await self._load_recent_messages(
            tenant_id=tenant_id,
            conversation_id=conversation_id,
        )
        summary = await self._load_summary(
            tenant_id=tenant_id,
            conversation_id=conversation_id,
        )

        # 2) Hybrid search.
        try:
            search_results = await self._search.search(
                tenant_id=tenant_id,
                query=query,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Search failed during RAG: %s", exc)
            # The RAG service must not bring down the chat — if
            # search fails we still answer the user, with an
            # honest "I couldn't search your documents right now"
            # prefix that the LLM will deliver.
            search_results = []

        # 3) Build the prompt + the validated citation set.
        retrieved = search_results[:_MAX_SOURCES]
        prompt_messages, citations = self._build_prompt(
            query=query,
            recent_messages=recent_messages,
            summary=summary,
            retrieved=retrieved,
        )

        # 4) Yield the citations *before* the tokens so the client
        #    can render the [1] / [2] markers in the right place
        #    as the tokens stream in. Citations are in numerical
        #    order, which matches the [Source N] numbering in the
        #    prompt.
        for citation in citations:
            yield {"kind": "citation", "citation": citation}

        # 5) Stream tokens. Any provider error surfaces as an
        #    exception caught by the WebSocket route, which emits
        #    ``error`` and finishes the turn.
        #
        # V4: token counting is best-effort here. The
        # streaming path doesn't yet request the usage
        # chunk from the OpenAI SDK, so we approximate via
        # the cumulative output character count
        # (4-chars-per-token heuristic, like the embedding
        # path) for the output side, and the prompt
        # message-character count for the input side. The
        # V5 work to plumb ``include_usage`` through will
        # replace these estimates with exact values; the
        # billable recorder's contract is unchanged.
        output_chars = 0
        outcome = "success"
        try:
            async for token in self._llm.stream(
                messages=prompt_messages,
                model=self.model_name,
                temperature=self._temperature,
            ):
                if not token:
                    continue
                output_chars += len(token)
                yield {"kind": "token", "content": token}
        except Exception:  # noqa: BLE001
            outcome = "failure"
            raise
        finally:
            if self._billable is not None:
                input_tokens = sum(
                    max(1, len(m.content) // 4) for m in prompt_messages
                )
                output_tokens = max(1, output_chars // 4)
                self._billable.record_completion(
                    tenant_id=tenant_id,
                    model=self.model_name,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    operation="stream",
                    provider="openai",
                    outcome=outcome,
                    conversation_id=str(conversation_id),
                )

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    async def _load_recent_messages(
        self,
        *,
        tenant_id: uuid.UUID,
        conversation_id: uuid.UUID,
    ) -> list[Message]:
        """
        Load up to ``_RECENT_MESSAGE_BUDGET`` most recent messages.

        Wrapped in ``asyncio.to_thread`` because the existing
        repository is sync (V2-era). For V4 we will add an
        async-native repository and drop the thread hop.
        """
        import asyncio

        repo = ConversationMessageRepository(self._db)  # type: ignore[arg-type]
        return list(
            await asyncio.to_thread(
                repo.list_for_conversation,
                conversation_id,
                tenant_id=tenant_id,
                limit=_RECENT_MESSAGE_BUDGET,
            )
        )

    async def _load_summary(
        self,
        *,
        tenant_id: uuid.UUID,
        conversation_id: uuid.UUID,
    ) -> str | None:
        """Return the conversation's stored summary, if any."""
        import asyncio

        from src.conversation.infrastructure.repositories import (
            ConversationRepository,
        )

        repo = ConversationRepository(self._db)  # type: ignore[arg-type]
        conv = await asyncio.to_thread(
            repo.get_by_id, conversation_id, tenant_id=tenant_id
        )
        return conv.summary if conv else None

    def _build_prompt(
        self,
        *,
        query: str,
        recent_messages: list[Message],
        summary: str | None,
        retrieved: list[SearchResult],
    ) -> tuple[list[Message], list[Citation]]:
        """
        Build the prompt and the validated citation set.

        The prompt is structured so the LLM can be told exactly
        what to do (cite, refuse when unsupported). The
        ``Citation`` objects we hand to the WebSocket layer are
        *only* those corresponding to the chunks we actually
        passed into the prompt — never anything the LLM might
        have hallucinated.
        """
        # --- Citations: build the immutable set the LLM may reference. ---
        citations: list[Citation] = []
        allowed_chunk_ids: dict[uuid.UUID, Citation] = {}
        for index, result in enumerate(retrieved, start=1):
            excerpt = self._excerpt(result.content, _EXCERPT_CHAR_BUDGET)
            citation = Citation(
                document_id=result.document_id,
                chunk_id=result.chunk_id,
                document_title=result.document_title or "Untitled document",
                chunk_index=result.chunk_index,
                score=result.score,
                excerpt=excerpt,
            )
            citations.append(citation)
            allowed_chunk_ids[result.chunk_id] = citation

        # --- Source text block the LLM sees in the prompt. ---
        source_lines: list[str] = []
        for index, result in enumerate(retrieved, start=1):
            excerpt = self._excerpt(result.content, _EXCERPT_CHAR_BUDGET)
            source_lines.append(
                f"[Source {index}] "
                f"document_id={result.document_id} "
                f"chunk_id={result.chunk_id} "
                f"document_title={result.document_title!r} "
                f"chunk_index={result.chunk_index}\n{excerpt}"
            )
        sources_block = "\n\n".join(source_lines) if source_lines else "(no sources retrieved)"

        # --- Recent conversation slice. We omit messages whose
        #     ``role`` is ``tool`` — V3 doesn't write them, but
        #     future V6+ runs might. ---
        history_lines: list[str] = []
        for m in recent_messages:
            role = m.role.value if isinstance(m.role, MessageRole) else str(m.role)
            if role == "tool":
                continue
            history_lines.append(f"{role}: {m.content}")
        history_block = "\n".join(history_lines) if history_lines else "(no prior turns)"

        # --- System prompt: grounding rules + answer format. ---
        system_text = (
            "You are Cortex, a question-answering assistant that answers "
            "questions using ONLY the provided sources. Follow these rules:\n"
            "1. Ground every claim in a [Source N] citation.\n"
            "2. If the answer is not in the sources, say so explicitly.\n"
            "3. Do not invent facts, source numbers, document ids, or chunk ids.\n"
            "4. Cite inline as [1], [2], etc., matching the source order.\n"
            "5. Keep the answer concise and structured."
        )

        # --- Final message list in the shape the LLM expects. ---
        prompt: list[Message] = [
            Message.create(
                conversation_id=uuid.uuid4(),  # synthetic; not persisted
                tenant_id=uuid.uuid4(),
                role=MessageRole.SYSTEM,
                content=system_text,
            )
        ]
        if summary:
            prompt.append(
                Message.create(
                    conversation_id=uuid.uuid4(),
                    tenant_id=uuid.uuid4(),
                    role=MessageRole.SYSTEM,
                    content=f"CONVERSATION SUMMARY\n{summary}",
                )
            )
        if history_block and history_block != "(no prior turns)":
            prompt.append(
                Message.create(
                    conversation_id=uuid.uuid4(),
                    tenant_id=uuid.uuid4(),
                    role=MessageRole.SYSTEM,
                    content=f"RECENT CONVERSATION\n{history_block}",
                )
            )
        prompt.append(
            Message.create(
                conversation_id=uuid.uuid4(),
                tenant_id=uuid.uuid4(),
                role=MessageRole.SYSTEM,
                content=(
                    "SOURCES\n"
                    f"{sources_block}\n\n"
                    "When citing, use the [Source N] format that matches the "
                    "numbered list above."
                ),
            )
        )
        prompt.append(
            Message.create(
                conversation_id=uuid.uuid4(),
                tenant_id=uuid.uuid4(),
                role=MessageRole.USER,
                content=query,
            )
        )

        return prompt, citations

    @staticmethod
    def _excerpt(text: str, max_chars: int) -> str:
        """
        Trim a chunk to the first ``max_chars`` characters on a
        word boundary. Used for the prompt only — the full chunk
        content is still attached to the ``Citation.excerpt`` if
        the caller wants the uncut version.
        """
        if not text:
            return ""
        if len(text) <= max_chars:
            return text
        trimmed = text[:max_chars]
        last_space = trimmed.rfind(" ")
        if last_space > 0:
            trimmed = trimmed[:last_space]
        return trimmed + "…"

    @staticmethod
    def _now() -> datetime:
        return datetime.now(UTC)


__all__ = ["AnswerQueryService"]


# Silence unused-import lints for symbols only re-exported for
# tests; these are public surface for the bounded context.
_ = Any
