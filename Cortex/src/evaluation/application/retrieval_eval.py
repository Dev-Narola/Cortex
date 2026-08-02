"""
Retrieval evaluator — runs a single strategy across a
dataset and returns a :class:`EvalReport`.

The brief asks for **4 strategies** to be compared
side-by-side:

* **vector**        — vector-only retrieval
* **keyword**       — keyword / FTS-only retrieval
* **hybrid**        — vector + keyword fused with RRF
* **hybrid_rerank** — hybrid + a reranker

The evaluator is **strategy-pluggable** — pass a
``RetrievalStrategy`` and a ``retrieval_fn`` that
returns a list of :class:`RetrievalHit`. The metrics
live in :mod:`src.evaluation.domain.metrics`; the
scoring is a single pass per case.

Why the four-strategy comparison matters:

The PRD's requirement is to *demonstrate* the value
of each step, not to assert it. A side-by-side
``vector | keyword | hybrid | hybrid_rerank`` table
in ``evals/results/`` is the artefact that answers
"Did V4 improve retrieval?" — the comparison is the
result, not the metric.

The class is async-friendly by accident: the
``retrieval_fn`` may be sync or async; the evaluator
calls it through a thin shim that handles both.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
from pathlib import Path
from typing import Any, Awaitable, Callable, Union

from src.evaluation.domain.entities import (
    EvalCase,
    EvalCaseResult,
    EvalReport,
    RetrievalHit,
    RetrievalStrategy,
)
from src.evaluation.domain.metrics import (
    aggregate_metrics,
    hit_rate_at_k,
    keyword_hit,
    mean_reciprocal_rank,
    precision_at_k,
    recall_at_k,
)


logger = logging.getLogger(__name__)


# A retrieval function is any callable that, given a
# question string, returns a list of RetrievalHit. It
# may be sync or async; the evaluator handles both.
RetrievalFn = Callable[[str], Union[list[RetrievalHit], Awaitable[list[RetrievalHit]]]]


def _normalise_strategy(strategy: RetrievalStrategy | str) -> RetrievalStrategy:
    if isinstance(strategy, RetrievalStrategy):
        return strategy
    try:
        return RetrievalStrategy(strategy)
    except ValueError as exc:
        raise ValueError(
            f"Unknown retrieval strategy: {strategy!r}. "
            f"Valid: {[s.value for s in RetrievalStrategy]}"
        ) from exc


async def _call_retrieval(
    fn: RetrievalFn, question: str
) -> list[RetrievalHit]:
    """Call a sync or async retrieval function and
    return the result."""
    result = fn(question)
    if inspect.isawaitable(result):
        result = await result  # type: ignore[assignment]
    # Defensive: a buggy retrieval function may return
    # a tuple or None; coerce to a list of hits.
    if not isinstance(result, list):
        logger.warning(
            "Retrieval function returned %s; coercing to []",
            type(result).__name__,
        )
        return []
    return result


class RetrievalEvaluator:
    """
    Run a single strategy across a dataset.

    The constructor captures the strategy + retrieval
    function. :meth:`run` executes the eval loop and
    returns a :class:`EvalReport`. The :class:`MultiStrategyEvaluator`
    wraps multiple evaluators for the four-way
    comparison.
    """

    def __init__(
        self,
        *,
        strategy: RetrievalStrategy | str,
        retrieval_fn: RetrievalFn,
        k: int = 5,
    ) -> None:
        self._strategy = _normalise_strategy(strategy)
        self._fn = retrieval_fn
        if k <= 0:
            raise ValueError("k must be >= 1")
        self._k = k

    @property
    def strategy(self) -> RetrievalStrategy:
        return self._strategy

    @property
    def k(self) -> int:
        return self._k

    async def evaluate_case(self, case: EvalCase) -> EvalCaseResult:
        """Score a single case. Used by ``MultiStrategyEvaluator``
        to run the same case through multiple strategies."""
        hits = await _call_retrieval(self._fn, case.question)
        top = hits[: self._k]
        retrieved_ids = [h.chunk_id for h in top]
        retrieved_doc_ids = [h.document_id for h in top]

        rel_chunks = {str(x) for x in case.relevant_chunk_ids}
        rel_docs = {str(x) for x in case.relevant_document_ids}

        def _is_relevant(hit) -> bool:
            """A hit is relevant if its chunk id is
            listed in the ground truth OR its document
            id is. The dataset's ground truth is often
            document-level (V4's brief), so the
            document-id check is the common path."""
            return hit.chunk_id in rel_chunks or hit.document_id in rel_docs

        # Build a per-hit "is relevant" list and use
        # document-level id spaces for the metric
        # denominator. This way ``recall_at_k`` is
        # correctly 1.0 when the only relevant document
        # is hit by *any* of the top-K chunks.
        relevant_doc_ids_in_top = [
            h.document_id for h in top if _is_relevant(h)
        ]
        r_at_k = recall_at_k(relevant_doc_ids_in_top, rel_docs, k=self._k)
        p_at_k = precision_at_k(relevant_doc_ids_in_top, rel_docs, k=self._k)
        h_at_k = hit_rate_at_k(relevant_doc_ids_in_top, rel_docs, k=self._k)
        mrr = mean_reciprocal_rank(
            relevant_doc_ids_in_top,
            rel_docs,
        )

        # Position of the first relevant (chunk or doc).
        first_relevant: int | None = None
        for i, h in enumerate(top, start=1):
            if _is_relevant(h):
                first_relevant = i
                break

        # V3 keyword fallback.
        kw_hit = keyword_hit(
            (h.content for h in top),
            case.expected_keywords,
        )

        return EvalCaseResult(
            case_id=case.id,
            retrieved_ids=retrieved_ids,
            retrieved_doc_ids=retrieved_doc_ids,
            relevant_ids=sorted(rel_chunks | rel_docs),
            relevant_doc_ids=sorted(rel_docs),
            recall_at_k=r_at_k,
            precision_at_k=p_at_k,
            hit_rate_at_k=h_at_k,
            mrr=mrr,
            keyword_hit=kw_hit,
            retrieved_at_first_relevant=first_relevant,
        )

    async def run(
        self,
        cases: list[EvalCase],
        *,
        dataset_path: str | Path = "",
        dataset_version: str = "",
        config: dict[str, Any] | None = None,
        suite: str = "retrieval",
    ) -> EvalReport:
        """Evaluate every case and aggregate the result."""
        if not cases:
            logger.warning(
                "evaluate.run: empty dataset; returning zeroed report"
            )
            return EvalReport(
                suite=suite,
                dataset_path=str(dataset_path),
                dataset_version=dataset_version,
                strategy=self._strategy.value,
                k=self._k,
                cases=0,
                metrics=aggregate_metrics([]),
                config=config or {},
            )

        results: list[EvalCaseResult] = []
        per_case_metrics: list[dict[str, float]] = []
        for case in cases:
            try:
                r = await self.evaluate_case(case)
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "RetrievalEvaluator: case %s failed (%s); recording as miss",
                    case.id,
                    exc,
                )
                # A failed case is a miss for every metric;
                # we still record it so the case count is
                # honest.
                r = EvalCaseResult(case_id=case.id)
            results.append(r)
            per_case_metrics.append(
                {
                    "recall_at_k": r.recall_at_k,
                    "precision_at_k": r.precision_at_k,
                    "hit_rate_at_k": r.hit_rate_at_k,
                    "mrr": r.mrr,
                    "keyword_hit_rate": 1.0 if r.keyword_hit else 0.0,
                }
            )

        return EvalReport(
            suite=suite,
            dataset_path=str(dataset_path),
            dataset_version=dataset_version,
            strategy=self._strategy.value,
            k=self._k,
            cases=len(cases),
            metrics=aggregate_metrics(per_case_metrics),
            config=config or {},
            case_results=results,
        )


class MultiStrategyEvaluator:
    """
    Run the same dataset through multiple retrieval
    strategies and return a list of :class:`EvalReport`,
    one per strategy.

    The brief asks specifically for the four-way
    comparison — a future "did V4 improve retrieval?"
    question is answered by diffing the resulting
    reports.
    """

    def __init__(
        self,
        strategies: dict[RetrievalStrategy | str, RetrievalFn],
        *,
        k: int = 5,
    ) -> None:
        if not strategies:
            raise ValueError("MultiStrategyEvaluator needs at least one strategy")
        self._evaluators: list[RetrievalEvaluator] = [
            RetrievalEvaluator(strategy=s, retrieval_fn=fn, k=k)
            for s, fn in strategies.items()
        ]
        self._k = k

    @property
    def k(self) -> int:
        return self._k

    async def run(
        self,
        cases: list[EvalCase],
        *,
        dataset_path: str | Path = "",
        dataset_version: str = "",
        config: dict[str, Any] | None = None,
        suite: str = "retrieval",
    ) -> list[EvalReport]:
        """
        Run every evaluator and return the reports.

        The same case list is passed to every evaluator;
        the case count is therefore constant across the
        returned reports, which is what the comparison
        table expects.
        """
        reports: list[EvalReport] = []
        for ev in self._evaluators:
            reports.append(
                await ev.run(
                    cases,
                    dataset_path=dataset_path,
                    dataset_version=dataset_version,
                    config=config,
                    suite=suite,
                )
            )
        return reports


# Convenience: a sync ``.run`` for code that doesn't
# want to think about asyncio. The async version is
# the canonical entry point.
def run_sync(evaluator: RetrievalEvaluator, *args: Any, **kwargs: Any) -> EvalReport:
    """Run an async evaluator to completion in a fresh
    event loop. Mostly for tests + scripts."""
    return asyncio.run(evaluator.run(*args, **kwargs))


__all__ = [
    "MultiStrategyEvaluator",
    "RetrievalEvaluator",
    "RetrievalFn",
    "run_sync",
]
