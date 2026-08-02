"""
V4 Phase 17 — faithfulness regression test.

The brief is explicit: "Fail the evaluation if
faithfulness < threshold." This file:

1. Loads the V4 faithfulness dataset
   (``tests/evals/datasets/faithfulness_v1.jsonl``).
2. Runs the deterministic :class:`FaithfulnessEvaluator`
   over every case.
3. Asserts the aggregate score is at or above a
   threshold derived from the operator's manual
   ground truth.

The threshold (default ``0.80``) is *not* arbitrary —
the brief says "the exact threshold should be based
on your baseline rather than arbitrarily chosen." V4
ships a 20-case dataset with hand-written answers; the
deterministic extractor should score all of them at
1.0 because every sentence in the answer appears
verbatim in the context. We assert ``>= 0.80`` so a
future refactor of the sentence splitter (which the
LLM-as-judge swap will do) doesn't silently regress
the floor.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from src.evaluation.application.faithfulness_eval import (
    FaithfulnessEvaluator,
    aggregate_faithfulness,
)
from src.evaluation.infrastructure.datasets import load_dataset


DATASET_PATH = (
    Path(__file__).parent / "datasets" / "faithfulness_v1.jsonl"
)
MIN_FAITHFULNESS = 0.80


# ---------------------------------------------------------------------------
# Dataset shape
# ---------------------------------------------------------------------------


class TestFaithfulnessDatasetShape:
    def test_dataset_file_exists(self):
        assert DATASET_PATH.exists(), (
            "tests/evals/datasets/faithfulness_v1.jsonl is required for V4 "
            "faithfulness evaluation"
        )

    def test_dataset_has_at_least_ten_rows(self):
        cases = load_dataset(DATASET_PATH, case_type="faithfulness")
        assert len(cases) >= 10, (
            f"V4 baseline needs at least 10 faithfulness cases, got {len(cases)}"
        )

    def test_each_row_has_required_fields(self):
        cases = load_dataset(DATASET_PATH, case_type="faithfulness")
        for i, c in enumerate(cases):
            assert c.question, f"row {i} missing 'question'"
            assert c.context, f"row {i} missing 'context'"
            assert c.answer, f"row {i} missing 'answer'"

    def test_extraction_mode_defaults_to_simple(self):
        cases = load_dataset(DATASET_PATH, case_type="faithfulness")
        for c in cases:
            assert c.extraction_mode in ("simple", "manual")


# ---------------------------------------------------------------------------
# Evaluator unit tests
# ---------------------------------------------------------------------------


class TestFaithfulnessScoring:
    def test_empty_answer_is_zero(self):
        ev = FaithfulnessEvaluator()
        from src.evaluation.domain.entities import FaithfulnessCase

        case = FaithfulnessCase(
            id="x",
            question="q",
            context=["some context"],
            answer="",
        )
        result = ev.evaluate_case(case)
        assert result.faithfulness == 0.0
        assert result.claims == []

    def test_full_support(self):
        ev = FaithfulnessEvaluator()
        from src.evaluation.domain.entities import FaithfulnessCase

        case = FaithfulnessCase(
            id="x",
            question="q",
            context=["the cat sat on the mat"],
            answer="The cat sat on the mat.",
        )
        result = ev.evaluate_case(case)
        assert result.faithfulness == 1.0
        assert result.unsupported == []

    def test_partial_support(self):
        ev = FaithfulnessEvaluator()
        from src.evaluation.domain.entities import FaithfulnessCase

        case = FaithfulnessCase(
            id="x",
            question="q",
            context=["the cat sat on the mat"],
            answer="The cat sat on the mat. The dog barked loudly.",
        )
        result = ev.evaluate_case(case)
        # 1 of 2 claims supported
        assert 0.0 < result.faithfulness < 1.0
        assert len(result.supported) == 1
        assert len(result.unsupported) == 1

    def test_no_support(self):
        ev = FaithfulnessEvaluator()
        from src.evaluation.domain.entities import FaithfulnessCase

        case = FaithfulnessCase(
            id="x",
            question="q",
            context=["the cat sat on the mat"],
            answer="Quantum physics describes the behaviour of subatomic particles.",
        )
        result = ev.evaluate_case(case)
        assert result.faithfulness == 0.0
        assert len(result.unsupported) >= 1

    def test_manual_mode_uses_declared_claims(self):
        ev = FaithfulnessEvaluator()
        from src.evaluation.domain.entities import FaithfulnessCase

        case = FaithfulnessCase(
            id="x",
            question="q",
            context=["irrelevant context"],
            answer="The answer says two things. Neither is in the context.",
            supported_claims=[
                "The answer says two things.",
                "Neither is in the context.",
            ],
            extraction_mode="manual",
        )
        result = ev.evaluate_case(case)
        assert result.faithfulness == 1.0
        assert len(result.supported) == 2

    def test_aggregate_faithfulness_shape(self):
        from src.evaluation.domain.entities import FaithfulnessCaseResult

        per_case = [
            FaithfulnessCaseResult(case_id="a", faithfulness=1.0),
            FaithfulnessCaseResult(case_id="b", faithfulness=0.0),
        ]
        summary = aggregate_faithfulness(per_case)
        assert summary["faithfulness"] == 0.5


# ---------------------------------------------------------------------------
# Regression test
# ---------------------------------------------------------------------------


class TestFaithfulnessRegression:
    """The V4 baseline must hold: faithfulness >= 0.80
    on the deterministic path. A future change to the
    extractor (e.g. swapping to LLM-as-judge) must not
    silently regress below the floor.
    """

    def test_baseline_faithfulness_above_threshold(self):
        cases = load_dataset(DATASET_PATH, case_type="faithfulness")
        ev = FaithfulnessEvaluator()
        results = [ev.evaluate_case(c) for c in cases]
        summary = aggregate_faithfulness(results)
        assert summary["faithfulness"] >= MIN_FAITHFULNESS, (
            f"faithfulness regressed: {summary['faithfulness']:.3f} "
            f"< threshold {MIN_FAITHFULNESS:.2f}. "
            f"({summary['supported_claims']}/{summary['total_claims']} "
            "claims supported)"
        )
