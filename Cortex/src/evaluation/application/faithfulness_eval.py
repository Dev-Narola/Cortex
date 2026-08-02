"""
Faithfulness evaluator — V4 Phase 17.

The brief is explicit: "Start with manual ground truth
and structured evaluation cases. Then optionally add
LLM-as-judge as a secondary evaluation method."

V4 ships the *deterministic* path:

* **simple** mode — the answer is split into
  sentence-like claims (terminated by ``.``, ``!``,
  ``?``). Each claim is supported if its lower-cased
  text appears in any chunk of the context. The
  score is ``supported / total_claims``.

* **manual** mode — the operator pre-declares the
  ground truth in :attr:`FaithfulnessCase.supported_claims`.
  Each sentence in the answer is supported iff it
  appears (case-insensitive, whitespace-normalised)
  in the ground truth set. This mode is *the* way to
  test a specific claim-extraction contract; ``simple``
  is the fallback when the operator hasn't
  pre-tokened the answers.

The "supported" predicate is intentionally strict
(case-insensitive *substring* match). A future LLM-as-
judge would replace this with a semantic-equivalence
check; the deterministic path stays as a baseline.

The class is a thin scorer — no I/O, no async, no
metrics side-effects. The application / interface
layer is responsible for aggregation and persistence.
"""

from __future__ import annotations

import re
import string
from typing import Iterable

from src.evaluation.domain.entities import (
    FaithfulnessCase,
    FaithfulnessCaseResult,
)


_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def _split_sentences(answer: str) -> list[str]:
    """Split an answer into sentence-like claims.

    The splitter is deliberately *simple* — a future
    LLM-based extractor (V5) will replace it. The point
    of the V4 path is to be deterministic and easy to
    reason about, not to be linguistically correct.
    """
    answer = (answer or "").strip()
    if not answer:
        return []
    parts = _SENTENCE_SPLIT_RE.split(answer)
    return [p.strip() for p in parts if p and p.strip()]


def _normalise(text: str) -> str:
    """Lowercase + strip + collapse whitespace.

    A claim with different case / whitespace is still
    considered the same claim; the operator's manual
    ground truth is normalised the same way.
    """
    if not text:
        return ""
    # ``str.translate`` is faster than a regex strip in a
    # hot loop; the punctuation table is a constant.
    text = text.lower().translate(str.maketrans("", "", string.punctuation))
    return " ".join(text.split())


def _claim_in_context(claim: str, context_chunks: Iterable[str]) -> bool:
    """A claim is supported if a context chunk contains
    it (case-insensitive, whitespace-normalised)."""
    norm_claim = _normalise(claim)
    if not norm_claim:
        return False
    for chunk in context_chunks:
        if norm_claim in _normalise(chunk):
            return True
    return False


class FaithfulnessEvaluator:
    """
    Score a single :class:`FaithfulnessCase`.

    The class is synchronous and stateless: the
    :class:`FaithfulnessRunner` (the application-layer
    orchestrator) loops over a dataset, calls
    :meth:`evaluate_case` for each, and aggregates
    the result.
    """

    def evaluate_case(self, case: FaithfulnessCase) -> FaithfulnessCaseResult:
        """Score one case.

        * If the answer is empty, the case scores 0.0
          (no claims, no support). The CI test sees
          this and the operator fixes the empty answer
          upstream.
        * ``manual`` mode: the operator's pre-declared
          ``supported_claims`` is the source of truth;
          a sentence is supported iff it appears in
          the set.
        * ``simple`` mode: each sentence is scored
          against the context (substring match).
        """
        sentences = _split_sentences(case.answer)
        if not sentences:
            return FaithfulnessCaseResult(
                case_id=case.id,
                claims=[],
                supported=[],
                unsupported=[],
                faithfulness=0.0,
            )

        if case.extraction_mode == "manual":
            supported_set = {_normalise(c) for c in case.supported_claims}
            supported: list[str] = []
            unsupported: list[str] = []
            for s in sentences:
                if _normalise(s) in supported_set:
                    supported.append(s)
                else:
                    unsupported.append(s)
        else:
            # ``simple`` mode — score against context.
            supported = [
                s for s in sentences
                if _claim_in_context(s, case.context)
            ]
            unsupported = [
                s for s in sentences
                if not _claim_in_context(s, case.context)
            ]

        score = len(supported) / len(sentences)
        return FaithfulnessCaseResult(
            case_id=case.id,
            claims=sentences,
            supported=supported,
            unsupported=unsupported,
            faithfulness=score,
        )


def aggregate_faithfulness(
    per_case: list[FaithfulnessCaseResult],
) -> dict[str, float]:
    """Aggregate per-case results into a summary dict.

    Returns ``faithfulness``, ``supported_claims``,
    ``total_claims`` — the same shape the runner
    serialises to JSON.
    """
    if not per_case:
        return {
            "faithfulness": 0.0,
            "supported_claims": 0,
            "total_claims": 0,
        }
    total_supported = sum(len(c.supported) for c in per_case)
    total_claims = sum(len(c.claims) for c in per_case)
    avg = sum(c.faithfulness for c in per_case) / len(per_case)
    return {
        "faithfulness": round(avg, 6),
        "supported_claims": int(total_supported),
        "total_claims": int(total_claims),
    }


__all__ = [
    "FaithfulnessEvaluator",
    "aggregate_faithfulness",
]
