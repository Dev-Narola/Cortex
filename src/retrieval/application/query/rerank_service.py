"""
Reranker application service.

Composes the rerank step into the search pipeline. The class is
intentionally thin — the actual ranking is done by an injected
``RerankerPort`` (the application depends on the port, not on
any concrete provider).

Failure policy: if the reranker raises, the service logs and
returns the input unchanged. The search service then keeps the
fused ordering, so search is *resilient* — a flaky reranker
never takes down the API. The caller can tell whether reranking
succeeded via the ``last_rerank_succeeded`` flag on the service
instance, which the search service reads after each call.
"""

from __future__ import annotations

import logging
import uuid

from src.retrieval.domain.entities import SearchResult
from src.retrieval.domain.ports import RerankerPort
from src.observability.application.billable import BillableRecorder

logger = logging.getLogger(__name__)


class RerankerService:
    """
    Application-level wrapper around a ``RerankerPort``.

    Tracks the *outcome* of the most recent ``rerank`` call on
    ``self.last_rerank_succeeded`` so the search service can stamp
    the per-result ``_rerank_succeeded`` metadata flag. Callers
    that want a guarantee that the search service does *not*
    silently swallow reranker failures should look at this flag
    rather than the return value.
    """

    def __init__(
        self,
        provider: RerankerPort,
        billable: BillableRecorder | None = None,
    ) -> None:
        self._provider = provider
        self.last_rerank_succeeded: bool = True
        # V4: optional usage-event recorder. The
        # :class:`IdentityReranker` is free, so the recorded
        # cost is 0.0; the event is still emitted so a future
        # real cross-encoder can be swapped in without
        # changing the call site.
        self._billable = billable

    async def rerank(
        self,
        query: str,
        documents: list[SearchResult],
        *,
        tenant_id: uuid.UUID | None = None,
    ) -> list[SearchResult]:
        if not documents:
            self.last_rerank_succeeded = True
            return []
        # Stamp a default rerank_score so downstream consumers
        # (citation UI, debug routes) can always read the field.
        for d in documents:
            d.rerank_score = d.fusion_score or d.score
        try:
            result = await self._provider.rerank(query, list(documents))
            self.last_rerank_succeeded = True
            # V4: record a billable rerank event. The model
            # name is whatever the underlying provider
            # reports (the V3 default is the literal string
            # ``identity``); a Cohere / cross-encoder swap
            # in V5 can change this without breaking the
            # contract.
            if self._billable is not None:
                model_name = getattr(self._provider, "model", "identity")
                self._billable.record_rerank(
                    tenant_id=tenant_id,
                    model=str(model_name),
                    candidate_count=len(documents),
                    selected_count=len(result),
                    provider=str(
                        getattr(self._provider, "provider", "identity")
                    ),
                )
            return result
        except Exception as exc:  # noqa: BLE001 - reranker is best-effort
            logger.warning(
                "Reranker provider raised; falling back to fused order: %s", exc
            )
            self.last_rerank_succeeded = False
            return list(documents)


__all__ = ["RerankerService"]
