"""
Reranker concrete implementations.

V3 ships an ``IdentityReranker`` that preserves the fused order.
That's not a "real" reranker — it's the *fallback*. The real
cross-encoder / Cohere Rerank integration lands in V4 once a
concrete hosted provider is in scope (see ADR-0018).

The infrastructure layer holds the actual implementation; the
application layer depends only on the ``RerankerPort`` protocol
defined in ``src.retrieval.domain.ports``.
"""

from __future__ import annotations

import json
import logging
import re
from types import SimpleNamespace

from src.retrieval.domain.entities import SearchResult
from src.retrieval.domain.ports import RerankerPort

logger = logging.getLogger(__name__)


class IdentityReranker(RerankerPort):
    """
    No-op reranker that preserves the fused order.

    Useful as the default when ``RERANKER_PROVIDER`` is unset, and
    as a documented fallback when a real reranker is unavailable.
    Sets ``rerank_score`` to the existing ``fusion_score`` so the
    field is always populated, even when no real cross-encoder
    was involved.
    """

    async def rerank(
        self,
        query: str,
        documents: list[SearchResult],
    ) -> list[SearchResult]:
        for doc in documents:
            doc.rerank_score = doc.fusion_score or doc.score
        return list(documents)


class LLMReranker(RerankerPort):
    """
    Second-pass relevance scoring with the configured chat LLM.

    One call per search: the model scores every candidate 0–10 against
    the query and returns JSON. Hosted cross-encoders on our provider
    were retired (see ADR-0032), so this is the reranker that is
    actually reachable. Any parse/provider failure raises, and
    ``RerankerService`` falls back to the fused order and flags it.
    """

    provider = "llm"

    def __init__(self, llm, *, model: str | None = None, max_chars: int = 700) -> None:
        self._llm = llm
        self.model = model or getattr(llm, "model", "unknown")
        # Usage is billed to the provider that actually served the call.
        self.provider = getattr(llm, "provider", "llm")
        self._max_chars = max_chars
        self.last_usage = None

    async def rerank(self, query: str, documents: list[SearchResult]) -> list[SearchResult]:
        if not documents:
            return []
        passages = "\n\n".join(
            f"[{i}] {d.content[: self._max_chars]}" for i, d in enumerate(documents)
        )
        # Duck-typed messages (role/content) keep retrieval free of the
        # conversation context's entities.
        messages = [
            SimpleNamespace(
                role="system",
                content=(
                    "You are a search relevance judge. Score how well each passage "
                    "answers the query, 0 (irrelevant) to 10 (directly answers). "
                    'Reply with JSON only: {"scores": [{"id": 0, "score": 7}, ...]} '
                    "covering every passage id."
                ),
            ),
            SimpleNamespace(role="user", content=f"Query: {query}\n\nPassages:\n{passages}"),
        ]
        raw = await self._llm.complete(messages, temperature=0.0)
        self.last_usage = getattr(self._llm, "last_usage", None)
        scores = _parse_scores(raw, len(documents))
        for i, d in enumerate(documents):
            d.rerank_score = scores[i] / 10.0
        # Stable sort: ties keep the fused order.
        return sorted(documents, key=lambda d: d.rerank_score, reverse=True)


def _parse_scores(raw: str, count: int) -> dict[int, float]:
    """Extract ``{id: score}`` from the model reply; raise if any id is missing."""
    match = re.search(r"\{.*\}", raw or "", re.DOTALL)
    if not match:
        raise ValueError("reranker reply contained no JSON object")
    items = json.loads(match.group(0)).get("scores", [])
    scores = {int(it["id"]): max(0.0, min(10.0, float(it["score"]))) for it in items}
    missing = set(range(count)) - scores.keys()
    if missing:
        raise ValueError(f"reranker reply missing ids {sorted(missing)}")
    return scores


__all__ = ["IdentityReranker", "LLMReranker"]
