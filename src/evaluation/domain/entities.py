"""
Evaluation domain entities.

V4 Phase 16 + 17 — both bounded contexts (retrieval
quality and faithfulness) live here. The dataset
loader and the evaluators consume these shapes; the
metrics live in a sibling module
(``src.evaluation.domain.metrics``).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any, ClassVar


# ---------------------------------------------------------------------------
# Phase 16 — retrieval
# ---------------------------------------------------------------------------


class RetrievalStrategy(str, Enum):
    """
    The closed set of retrieval strategies V4 evaluates.
    """

    VECTOR = "vector"
    KEYWORD = "keyword"
    HYBRID = "hybrid"
    HYBRID_RERANK = "hybrid_rerank"


@dataclass(frozen=True)
class EvalCase:
    """
    One evaluation question + the ground truth.
    """

    id: str
    question: str
    relevant_document_ids: list[str] = field(default_factory=list)
    relevant_chunk_ids: list[str] = field(default_factory=list)
    expected_keywords: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    _KEYWORDS_MAX: ClassVar[int] = 32
    _KEYWORD_MAX_LEN: ClassVar[int] = 128
    _QUESTION_MAX_LEN: ClassVar[int] = 4_096

    def __post_init__(self) -> None:
        if not isinstance(self.id, str) or not self.id.strip():
            raise ValueError("EvalCase.id must be a non-empty string")
        if not isinstance(self.question, str) or not self.question.strip():
            raise ValueError("EvalCase.question must be a non-empty string")
        if len(self.question) > self._QUESTION_MAX_LEN:
            raise ValueError(
                f"EvalCase.question too long ({len(self.question)} > "
                f"{self._QUESTION_MAX_LEN})"
            )
        if len(self.expected_keywords) > self._KEYWORDS_MAX:
            raise ValueError(
                f"EvalCase.expected_keywords too long "
                f"({len(self.expected_keywords)} > {self._KEYWORDS_MAX})"
            )
        for kw in self.expected_keywords:
            if not isinstance(kw, str) or len(kw) > self._KEYWORD_MAX_LEN:
                raise ValueError(f"EvalCase keyword invalid: {kw!r}")


@dataclass(frozen=True)
class RetrievalHit:
    chunk_id: str
    document_id: str
    content: str = ""
    score: float = 0.0
    strategy: str = ""


@dataclass(frozen=True)
class EvalCaseResult:
    case_id: str
    retrieved_ids: list[str] = field(default_factory=list)
    retrieved_doc_ids: list[str] = field(default_factory=list)
    relevant_ids: list[str] = field(default_factory=list)
    relevant_doc_ids: list[str] = field(default_factory=list)
    recall_at_k: float = 0.0
    precision_at_k: float = 0.0
    hit_rate_at_k: float = 0.0
    mrr: float = 0.0
    keyword_hit: bool = False
    retrieved_at_first_relevant: int | None = None


# ---------------------------------------------------------------------------
# Phase 17 — faithfulness
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FaithfulnessCase:
    """
    One RAG answer + the manual ground truth.

    * ``context`` is a list of retrieved chunks.
    * ``answer`` is the LLM's response.
    * ``supported_claims`` is the manual ground truth —
      the list of claims the operator has verified are
      supported by the context.
    * ``extraction_mode`` is "simple" (default sentence
      splitter) or "manual" (the operator pre-tokens
      the claims and every claim in ``answer`` must
      appear in ``supported_claims`` to count).
    """

    id: str
    question: str
    context: list[str] = field(default_factory=list)
    answer: str = ""
    supported_claims: list[str] = field(default_factory=list)
    extraction_mode: str = "simple"
    metadata: dict[str, object] = field(default_factory=dict)

    _QUESTION_MAX_LEN: ClassVar[int] = 4_096
    _ANSWER_MAX_LEN: ClassVar[int] = 16_384
    _CONTEXT_MAX_LEN: ClassVar[int] = 32_768
    _CLAIM_MAX_LEN: ClassVar[int] = 2_048
    _CLAIMS_MAX: ClassVar[int] = 64

    def __post_init__(self) -> None:
        if not isinstance(self.id, str) or not self.id.strip():
            raise ValueError("FaithfulnessCase.id must be a non-empty string")
        if len(self.question) > self._QUESTION_MAX_LEN:
            raise ValueError("FaithfulnessCase.question too long")
        if len(self.answer) > self._ANSWER_MAX_LEN:
            raise ValueError("FaithfulnessCase.answer too long")
        for i, c in enumerate(self.context):
            if not isinstance(c, str):
                raise ValueError(f"FaithfulnessCase.context[{i}] must be a string")
            if len(c) > self._CONTEXT_MAX_LEN:
                raise ValueError(
                    f"FaithfulnessCase.context[{i}] too long "
                    f"({len(c)} > {self._CONTEXT_MAX_LEN})"
                )
        if len(self.supported_claims) > self._CLAIMS_MAX:
            raise ValueError(
                f"FaithfulnessCase.supported_claims too long "
                f"({len(self.supported_claims)} > {self._CLAIMS_MAX})"
            )
        for c in self.supported_claims:
            if not isinstance(c, str) or len(c) > self._CLAIM_MAX_LEN:
                raise ValueError(
                    f"FaithfulnessCase.supported_claims entry invalid: {c!r}"
                )
        if self.extraction_mode not in ("simple", "manual"):
            raise ValueError(
                f"FaithfulnessCase.extraction_mode must be 'simple' or 'manual', "
                f"got {self.extraction_mode!r}"
            )


@dataclass(frozen=True)
class FaithfulnessCaseResult:
    case_id: str
    claims: list[str] = field(default_factory=list)
    supported: list[str] = field(default_factory=list)
    unsupported: list[str] = field(default_factory=list)
    faithfulness: float = 0.0


# ---------------------------------------------------------------------------
# Phase 18 — shared report
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class EvalReport:
    suite: str
    dataset_path: str
    dataset_version: str
    strategy: str
    k: int
    cases: int
    metrics: dict[str, float]
    config: dict[str, Any] = field(default_factory=dict)
    git_commit: str = ""
    timestamp: str = field(
        default_factory=lambda: datetime.now(UTC).isoformat()
    )
    case_results: list[Any] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "suite": self.suite,
            "dataset_path": self.dataset_path,
            "dataset_version": self.dataset_version,
            "strategy": self.strategy,
            "k": self.k,
            "cases": self.cases,
            "metrics": self.metrics,
            "config": self.config,
            "git_commit": self.git_commit,
            "timestamp": self.timestamp,
        }


__all__ = [
    "EvalCase",
    "EvalCaseResult",
    "EvalReport",
    "FaithfulnessCase",
    "FaithfulnessCaseResult",
    "RetrievalHit",
    "RetrievalStrategy",
]
