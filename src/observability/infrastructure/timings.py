"""
Pipeline timings — V4 Phase 19.

Per the brief, every stage of the RAG answer pipeline
must be measured so the operator can identify the
bottleneck. The V4 stages (matching the brief) are:

* ``query_embedding``     — the user's question
                              embedded
* ``vector_search``        — pgvector top-K
* ``keyword_search``       — Postgres FTS top-K
* ``fusion``               — RRF or similar
* ``rerank``               — cross-encoder / Cohere
* ``context_construction`` — prompt build
* ``llm_first_token``      — time-to-first-token
* ``llm_total``            — total completion

The ``PipelineTimings`` helper is a tiny context-manager
that records the duration of each stage to:

1. the Prometheus histogram
   :data:`PIPELINE_STAGE_DURATION_SECONDS` (the
   source of truth for the p95 latency targets in
   ADR-0024);
2. an in-memory ``PipelineTimingsReport`` for
   end-of-request logging (so the operator can see
   "auth=8ms / embed=120ms / ..." in the log line
   when something goes wrong).

Anti-corruption:

* The helper does *not* log anything itself — the
  caller is the one that decides whether the report
  is structured-logged, attached to a span, or
  discarded.
* The helper is dependency-injectable; the histogram
  call is a one-liner that the unit suite can mock.
"""

from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Iterator

from src.observability.infrastructure.metrics import (
    PIPELINE_STAGE_DURATION_SECONDS,
)


logger = logging.getLogger(__name__)


# The closed set of stages. Adding a new stage is a
# deliberate decision: it shows up in every dashboard.
SUPPORTED_STAGES: frozenset[str] = frozenset(
    {
        "query_embedding",
        "vector_search",
        "keyword_search",
        "fusion",
        "rerank",
        "context_construction",
        "llm_first_token",
        "llm_total",
    }
)


@dataclass
class StageSample:
    """A single stage's timing."""

    stage: str
    duration_ms: float
    start_monotonic_ns: int
    end_monotonic_ns: int


@dataclass
class PipelineTimingsReport:
    """The full per-request pipeline timing report."""

    stages: dict[str, StageSample] = field(default_factory=dict)
    started_monotonic_ns: int = 0
    ended_monotonic_ns: int = 0

    def total_ms(self) -> float:
        if not self.started_monotonic_ns or not self.ended_monotonic_ns:
            return 0.0
        return (self.ended_monotonic_ns - self.started_monotonic_ns) / 1_000_000.0

    def to_dict(self) -> dict[str, float]:
        """Serialise for log lines / span attributes."""
        out: dict[str, float] = {}
        for stage, sample in self.stages.items():
            out[f"stage.{stage}.ms"] = round(sample.duration_ms, 3)
        out["total_ms"] = round(self.total_ms(), 3)
        return out

    def to_log_kv(self) -> str:
        """Compact k=v;k=v form for a single log line."""
        return " ".join(
            f"{k}={v}" for k, v in sorted(self.to_dict().items())
        )


class PipelineTimings:
    """
    Record per-stage durations for a single RAG answer
    pipeline run.

    Usage:

        timings = PipelineTimings()
        timings.start()
        with timings.stage("query_embedding"):
            ...
        with timings.stage("vector_search"):
            ...
        report = timings.finish()
        log.info("rag_complete", **report.to_dict())
    """

    def __init__(self) -> None:
        self._report = PipelineTimingsReport()
        self._active: dict[str, int] = {}
        self._finished = False

    def start(self) -> None:
        if self._report.started_monotonic_ns:
            return
        self._report.started_monotonic_ns = time.perf_counter_ns()

    @contextmanager
    def stage(self, name: str) -> Iterator[None]:
        """
        Time a single stage. Records to the Prometheus
        histogram on exit and to the in-memory report.

        A stage name outside :data:`SUPPORTED_STAGES`
        is logged at WARNING but still recorded — the
        metric cardinality is bounded because the
        histogram's ``labelnames=("stage",)`` is
        independent of the *values* it sees.
        """
        if name not in SUPPORTED_STAGES:
            logger.warning(
                "PipelineTimings: unknown stage %r (supported: %s); "
                "the metric will still be recorded but is not in the brief",
                name,
                sorted(SUPPORTED_STAGES),
            )
        if not self._report.started_monotonic_ns:
            self.start()
        start_ns = time.perf_counter_ns()
        self._active[name] = start_ns
        try:
            yield
        finally:
            end_ns = time.perf_counter_ns()
            duration_s = (end_ns - start_ns) / 1_000_000_000.0
            duration_ms = (end_ns - start_ns) / 1_000_000.0
            self._report.stages[name] = StageSample(
                stage=name,
                duration_ms=duration_ms,
                start_monotonic_ns=start_ns,
                end_monotonic_ns=end_ns,
            )
            try:
                PIPELINE_STAGE_DURATION_SECONDS.labels(stage=name).observe(
                    duration_s
                )
            except Exception:  # noqa: BLE001 - never let metrics break a request
                logger.exception(
                    "PipelineTimings: histogram observe failed for stage=%s",
                    name,
                )
            self._active.pop(name, None)

    def finish(self) -> PipelineTimingsReport:
        if self._finished:
            return self._report
        self._finished = True
        if not self._report.ended_monotonic_ns:
            self._report.ended_monotonic_ns = time.perf_counter_ns()
        if self._active:
            # The caller forgot to close a stage. We
            # don't want to lose the data, so we
            # close them with whatever end-time is
            # current.
            now_ns = time.perf_counter_ns()
            for name, start_ns in list(self._active.items()):
                self._report.stages[name] = StageSample(
                    stage=name,
                    duration_ms=(now_ns - start_ns) / 1_000_000.0,
                    start_monotonic_ns=start_ns,
                    end_monotonic_ns=now_ns,
                )
                try:
                    PIPELINE_STAGE_DURATION_SECONDS.labels(
                        stage=name,
                    ).observe((now_ns - start_ns) / 1_000_000_000.0)
                except Exception:  # noqa: BLE001
                    logger.exception(
                        "PipelineTimings: late observe for stage=%s", name
                    )
            self._active.clear()
        return self._report


__all__ = [
    "PipelineTimings",
    "PipelineTimingsReport",
    "StageSample",
    "SUPPORTED_STAGES",
]
