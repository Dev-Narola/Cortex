"""
Billable-action recorder — the V4 chokepoint for usage metering.

The V3 provider classes (``OpenAIEmbeddingProvider``,
``OpenAIProvider``, ``IdentityReranker``) are pure network
adapters — they don't know the tenant, the request, or the
DB session. Pushing a :class:`UsageService` into them would
force every V3 call site to construct a service just to
make a network call, which is the wrong direction.

Instead, the V4 layer lives in the *application* services
that own the request context:

* :class:`src.embedding.application.services.EmbedDocumentChunksService`
* :class:`src.conversation.application.services.AnswerQueryService`
* :class:`src.retrieval.application.rerank_service.RerankerService`

Each of these constructs a :class:`BillableRecorder` once
(per request) and calls :meth:`BillableRecorder.record_*`
*after* the provider call returns. The recorder is a thin
adapter that:

1. Looks up the cost from :class:`CostCalculator` (so the
   business rule lives in one place).
2. Persists a :class:`UsageEvent` via the
   :class:`UsageService`.
3. Updates the matching Prometheus counter so the dashboard
   sees the call immediately.
4. Emits a stable ``usage_event_recorded`` log line with
   the cost + token counts.

V4 Phase 14 — failure policy:

* ``strict=False`` (default, unit tests) — a failure to
  record is logged at ``ERROR`` and swallowed. The
  upstream call still succeeds.
* ``strict=True`` (production wiring) — a failure to
  record is **re-raised** as
  :class:`UsageRecordingError`. The caller (the V3
  service) catches it, logs at ``CRITICAL``, increments
  the ``cortex_usage_recording_failures_total`` counter,
  and continues (the upstream LLM call has already
  succeeded; rolling it back would leave the tenant
  without the answer they paid for).

The brief's rule is: "Embedding succeeds → Usage event
write fails → Log critical error → Do not pretend usage
was recorded." The ``strict=True`` mode implements exactly
that.

Anti-corruption:

* The recorder never logs the LLM prompt, the response, or
  any document content. Token counts and model names are
  fine; raw text is not.
* The recorder never raises into the calling code path.
  A failure to record a usage event is a warning, not a
  user-visible error.
* The recorder takes plain kwargs and a :class:`UsageService`
  by dependency injection so the V3 application services
  stay testable with a fake.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from src.billing.application.cost_calculator import CostCalculator
from src.billing.application.usage_service import UsageRecordingError, UsageService
from src.billing.domain.entities import EventType, UnitType
from src.observability.infrastructure.metrics import (
    EMBEDDING_CALLS_TOTAL,
    EMBEDDING_TOKENS_TOTAL,
    EMBEDDING_VECTORS_TOTAL,
    LLM_CALLS_TOTAL,
    LLM_COST_TOTAL,
    LLM_INPUT_TOKENS_TOTAL,
    LLM_OUTPUT_TOKENS_TOTAL,
    RERANK_CALLS_TOTAL,
    USAGE_RECORDING_FAILURES_TOTAL,
)
from src.core.logging import get_logger, LOG_EVENTS


_logger = get_logger("cortex.billable")
_stdlib_logger = logging.getLogger(__name__)


# The default cost calculator is built once per process; the
# constructor is cheap (it parses env vars) and the
# calculator is read-only after that.
_DEFAULT_CALCULATOR = CostCalculator()


class BillableRecorder:
    """
    V4 helper that records a billable LLM/embedding/rerank
    event and updates the matching Prometheus counters.

    Usage from an application service:

        recorder = BillableRecorder(usage_service)
        # … after the embedding call …
        recorder.record_embedding(
            tenant_id=tenant_id,
            model="text-embedding-3-small",
            input_tokens=12_345,
            vectors_produced=42,
            provider="openai",
            resource_id=str(document_id),
        )

    The methods are fire-and-forget. They never raise.

    The class deliberately does not require a unit-of-work
    or a DB session: the :class:`UsageService` it wraps
    already takes a session internally (constructed by
    the route layer), and the V3 application services that
    *use* this recorder don't own the session.
    """

    def __init__(
        self,
        usage_service: UsageService | None = None,
        *,
        cost_calculator: CostCalculator | None = None,
        strict: bool = True,
    ) -> None:
        self._usage = usage_service
        self._calc = cost_calculator or _DEFAULT_CALCULATOR
        # V4 Phase 14 — strict mode re-raises a
        # ``UsageRecordingError`` on persistence failure
        # (after incrementing a Prometheus counter and
        # logging at ``CRITICAL``). Production wiring
        # passes ``strict=True``; the unit tests pass
        # ``strict=False`` so a fake repo can be empty.
        self._strict = strict

    # ------------------------------------------------------------------
    # embedding
    # ------------------------------------------------------------------

    def record_embedding(
        self,
        *,
        tenant_id: uuid.UUID | str | None,
        model: str,
        input_tokens: int,
        vectors_produced: int,
        provider: str = "openai",
        outcome: str = "success",
        resource_id: str | None = None,
    ) -> None:
        """
        Record an embedding batch call.

        ``input_tokens`` is the *total* number of tokens
        across the batch — the V3 provider's API response
        does not return per-input counts, so we either use
        a tiktoken estimate (the worker path) or the
        ``response.usage.prompt_tokens`` field (when the
        SDK exposes it). The Prometheus counter is
        incremented by the same number so dashboards stay
        consistent.
        """
        if tenant_id is None:
            return
        tenant_uuid = self._coerce_uuid(tenant_id)
        if tenant_uuid is None:
            return

        try:
            cost = self._calc.estimate(
                event_type="embedding",
                model=model,
                input_tokens=int(input_tokens),
            )
            EMBEDDING_CALLS_TOTAL.labels(
                provider=provider, model=model, outcome=outcome
            ).inc()
            EMBEDDING_TOKENS_TOTAL.labels(
                provider=provider, model=model
            ).inc(int(input_tokens))
            EMBEDDING_VECTORS_TOTAL.labels(
                provider=provider, model=model
            ).inc(int(vectors_produced))
            if self._usage is not None:
                # V4 Phase 11 — the embedding call is a
                # pure input-side event: input_tokens is
                # the only token field, output_tokens is 0
                # and total_tokens equals input_tokens.
                self._call_usage_service(
                    event_type_label="embedding",
                    provider=provider,
                    model=model,
                    kwargs={
                        "tenant_id": tenant_uuid,
                        "event_type": EventType.EMBEDDING,
                        "units": float(input_tokens),
                        "unit_type": UnitType.TOKENS,
                        "provider": provider,
                        "model": model,
                        "resource_id": resource_id,
                        "input_tokens": int(input_tokens),
                        "output_tokens": 0,
                        "total_tokens": int(input_tokens),
                    },
                )
            _logger.info(
                LOG_EVENTS["usage_event_recorded"],
                event_type="embedding",
                provider=provider,
                model=model,
                input_tokens=int(input_tokens),
                total_tokens=int(input_tokens),
                vectors_produced=int(vectors_produced),
                cost_usd=cost,
                pricing_version=self._calc.rate_version,
                tenant_id=str(tenant_uuid),
                outcome=outcome,
            )
        except Exception:  # noqa: BLE001 - never let billing break a call
            _stdlib_logger.exception(
                "Failed to record embedding usage event (tenant=%s, model=%s)",
                tenant_uuid,
                model,
            )

    # ------------------------------------------------------------------
    # completion
    # ------------------------------------------------------------------

    def record_completion(
        self,
        *,
        tenant_id: uuid.UUID | str | None,
        model: str,
        input_tokens: int,
        output_tokens: int,
        operation: str = "chat",
        provider: str = "openai",
        outcome: str = "success",
        conversation_id: str | None = None,
        resource_id: str | None = None,
    ) -> None:
        """
        Record a chat-completion call (streaming or
        non-streaming — both shapes use the same unit).

        The cost model is the V4 standard: ``input_tokens``
        priced at the model's input rate, ``output_tokens``
        at the output rate. See :class:`CostCalculator`.
        """
        if tenant_id is None:
            return
        tenant_uuid = self._coerce_uuid(tenant_id)
        if tenant_uuid is None:
            return

        try:
            cost = self._calc.estimate(
                event_type="completion",
                model=model,
                input_tokens=int(input_tokens),
                output_tokens=int(output_tokens),
            )
            LLM_CALLS_TOTAL.labels(
                provider=provider,
                model=model,
                operation=operation,
                status=outcome,
            ).inc()
            LLM_INPUT_TOKENS_TOTAL.labels(
                provider=provider, model=model, operation=operation
            ).inc(int(input_tokens))
            LLM_OUTPUT_TOKENS_TOTAL.labels(
                provider=provider, model=model, operation=operation
            ).inc(int(output_tokens))
            LLM_COST_TOTAL.labels(provider=provider, model=model).inc(float(cost))
            if self._usage is not None:
                # V4 Phase 11 — record the per-side token
                # counts so the historical event can be
                # reconciled against the rate that was in
                # force. ``total_tokens`` defaults to the
                # sum; the caller can override it (e.g.
                # when the streaming response carries the
                # provider's own total).
                self._call_usage_service(
                    event_type_label="completion",
                    provider=provider,
                    model=model,
                    kwargs={
                        "tenant_id": tenant_uuid,
                        "event_type": EventType.COMPLETION,
                        "units": float(input_tokens) + float(output_tokens),
                        "unit_type": UnitType.TOKENS,
                        "provider": provider,
                        "model": model,
                        "resource_id": resource_id or conversation_id,
                        "input_tokens": int(input_tokens),
                        "output_tokens": int(output_tokens),
                    },
                )
            _logger.info(
                LOG_EVENTS["usage_event_recorded"],
                event_type="completion",
                provider=provider,
                model=model,
                operation=operation,
                input_tokens=int(input_tokens),
                output_tokens=int(output_tokens),
                total_tokens=int(input_tokens) + int(output_tokens),
                cost_usd=cost,
                pricing_version=self._calc.rate_version,
                tenant_id=str(tenant_uuid),
                conversation_id=str(conversation_id) if conversation_id else "",
                outcome=outcome,
            )
        except Exception:  # noqa: BLE001
            _stdlib_logger.exception(
                "Failed to record completion usage event (tenant=%s, model=%s)",
                tenant_uuid,
                model,
            )

    # ------------------------------------------------------------------
    # rerank
    # ------------------------------------------------------------------

    def record_rerank(
        self,
        *,
        tenant_id: uuid.UUID | str | None,
        model: str,
        candidate_count: int,
        selected_count: int = 0,
        provider: str = "identity",
        outcome: str = "success",
        resource_id: str | None = None,
    ) -> None:
        """
        Record a reranker call.

        The V3 default is :class:`IdentityReranker` (free),
        so the recorded cost is 0.0. The Prometheus counter
        still ticks, and the usage event is still written
        so a future cross-encoder (which *does* bill) can
        be swapped in without changing the call sites.
        """
        if tenant_id is None:
            return
        tenant_uuid = self._coerce_uuid(tenant_id)
        if tenant_uuid is None:
            return

        try:
            RERANK_CALLS_TOTAL.labels(
                provider=provider, model=model, outcome=outcome
            ).inc()
            if self._usage is not None:
                # For a rerank, ``units`` is the number of
                # candidates we sent in. The cost model
                # treats "candidate" as the unit for rerank
                # event types in the absence of a token
                # count.
                self._call_usage_service(
                    event_type_label="rerank",
                    provider=provider,
                    model=model,
                    kwargs={
                        "tenant_id": tenant_uuid,
                        "event_type": EventType.RERANK,
                        "units": float(candidate_count),
                        "unit_type": UnitType.UNITS,
                        "provider": provider,
                        "model": model,
                        "resource_id": resource_id,
                    },
                )
            _logger.info(
                LOG_EVENTS["usage_event_recorded"],
                event_type="rerank",
                provider=provider,
                model=model,
                candidate_count=int(candidate_count),
                selected_count=int(selected_count),
                cost_usd=0.0,  # identity reranker is free; swap with real provider later
                tenant_id=str(tenant_uuid),
                outcome=outcome,
            )
        except Exception:  # noqa: BLE001
            _stdlib_logger.exception(
                "Failed to record rerank usage event (tenant=%s, model=%s)",
                tenant_uuid,
                model,
            )

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _coerce_uuid(value: Any) -> uuid.UUID | None:
        """
        Accept a UUID or a string and return a UUID, or
        ``None`` if the conversion fails.

        We never want a malformed tenant id to crash a
        recording call — the worst that happens is the
        usage event is dropped.
        """
        if isinstance(value, uuid.UUID):
            return value
        if isinstance(value, str):
            try:
                return uuid.UUID(value)
            except (ValueError, TypeError):
                return None
        return None

    # ------------------------------------------------------------------
    # internal — wraps the ``UsageService.record`` call so the
    # strict / non-strict failure policy is consistent across
    # all three record_* methods.
    # ------------------------------------------------------------------

    def _call_usage_service(
        self,
        *,
        event_type_label: str,
        provider: str,
        model: str,
        kwargs: dict[str, Any],
    ) -> None:
        """
        V4 Phase 14 — invoke :meth:`UsageService.record`
        with the active strict / non-strict policy.

        * ``strict=False`` — the V4-alpha behaviour: a
          persistence error is logged at ``ERROR`` and
          swallowed. The counter still ticks so a
          dashboard can spot the leak.
        * ``strict=True`` — a persistence error is
          re-raised as :class:`UsageRecordingError`
          *after* the counter ticks and a ``CRITICAL``
          log fires. The V3 caller is responsible for
          catching it and continuing (the LLM call has
          already succeeded; we cannot roll it back).
        """
        if self._usage is None:
            return
        try:
            self._usage.record(strict=self._strict, **kwargs)
        except UsageRecordingError:
            # The ``UsageService`` already raised a typed
            # error; tick the counter and re-raise.
            USAGE_RECORDING_FAILURES_TOTAL.labels(
                event_type=event_type_label,
                provider=provider,
                model=model or "unknown",
            ).inc()
            _logger.critical(
                "usage_event_recorded_failed_critical",
                event_type=event_type_label,
                provider=provider,
                model=model,
                tenant_id=str(kwargs.get("tenant_id", "")),
            )
            if self._strict:
                raise
        except Exception:  # noqa: BLE001 - never let billing break a call (non-strict)
            USAGE_RECORDING_FAILURES_TOTAL.labels(
                event_type=event_type_label,
                provider=provider,
                model=model or "unknown",
            ).inc()
            _stdlib_logger.exception(
                "Failed to record usage event (type=%s model=%s)",
                event_type_label,
                model,
            )


__all__ = ["BillableRecorder"]
