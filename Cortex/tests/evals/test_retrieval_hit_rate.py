"""
V3 retrieval-quality baseline.

Loads ``tests/evals/dataset.jsonl`` and measures the *retrieval
hit rate*: of the top-``K`` chunks returned for each question,
how often does at least one mention an expected keyword from
the gold standard.

The test is **deliberately minimal** — full retrieval/faithfulness
evaluation lands in V4. V3's bar is: at minimum, did the right
*source* appear in the top-K?

Run with:

    pytest tests/evals/ -q

The test is marked ``skipif`` if ``tests/evals/dataset.jsonl``
is missing (it ships in the repo, but a fresh clone might lack
it). The evaluator itself is async so the same fixtures used
by the search integration test can drive it.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

import pytest


DATASET_PATH = Path(__file__).parent / "dataset.jsonl"


def _load_dataset() -> list[dict[str, Any]]:
    if not DATASET_PATH.exists():
        pytest.skip("dataset.jsonl missing — populate tests/evals/dataset.jsonl")
    out: list[dict[str, Any]] = []
    with DATASET_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            out.append(json.loads(line))
    return out


def _hit_rate(
    *,
    search_results_by_question: dict[str, list[str]],
    keyword_for_question: dict[str, list[str]],
) -> float:
    """For each question, did *any* top-K chunk contain *any* expected
    keyword? Return the fraction of questions that hit."""
    if not keyword_for_question:
        return 0.0
    hits = 0
    for q, kws in keyword_for_question.items():
        results = search_results_by_question.get(q, [])
        joined = " ".join(results).lower()
        if any(kw.lower() in joined for kw in kws):
            hits += 1
    return hits / len(keyword_for_question)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestEvalDatasetShape:
    """The dataset itself must be well-formed before we run anything."""

    def test_dataset_file_exists(self):
        assert DATASET_PATH.exists(), (
            "tests/evals/dataset.jsonl is required for V3 retrieval eval"
        )

    def test_dataset_has_at_least_five_rows(self):
        rows = _load_dataset()
        assert len(rows) >= 5, (
            "V3 baseline needs at least 5 (q, expected) pairs"
        )

    def test_each_row_has_required_fields(self):
        for i, row in enumerate(_load_dataset()):
            assert "question" in row, f"row {i} missing 'question'"
            assert "expected_keywords" in row, (
                f"row {i} missing 'expected_keywords' — at minimum "
                "the question needs a list of expected substrings"
            )
            assert isinstance(row["expected_keywords"], list)
            assert row["expected_keywords"], (
                f"row {i} has empty 'expected_keywords' list"
            )


class TestHitRateScoring:
    """The hit-rate scorer must be deterministic and well-behaved."""

    def test_empty_dataset_returns_zero(self):
        assert _hit_rate(search_results_by_question={}, keyword_for_question={}) == 0.0

    def test_perfect_hit_rate(self):
        # Each question's expected keyword appears in its top-K results.
        search_results = {
            "q1": ["this is a chunk about retries"],
            "q2": ["something about chunking and embedding"],
        }
        kws = {"q1": ["retries"], "q2": ["chunking"]}
        # ``hit_rate`` is ``hits / total``; for two questions with
        # two hits each, that's 2/2 = 1.0. Each ``kw`` list hits
        # exactly one question (the matching one).
        assert _hit_rate(search_results_by_question=search_results, keyword_for_question=kws) == 1.0

    def test_zero_hit_rate(self):
        search_results = {
            "q1": ["chunk about completely different stuff"],
        }
        kws = {"q1": ["retry", "idempotent"]}
        assert _hit_rate(search_results_by_question=search_results, keyword_for_question=kws) == 0.0

    def test_partial_hit_rate(self):
        search_results = {
            "q1": ["yes this matches retry"],
            "q2": ["nothing about idempotency here"],
        }
        kws = {"q1": ["retry"], "q2": ["idempotent"]}
        assert _hit_rate(search_results_by_question=search_results, keyword_for_question=kws) == 0.5

    def test_any_keyword_match_counts_as_hit(self):
        """A question with multiple expected keywords is a hit if
        ANY of them appears in the top-K. This makes the metric
        forgiving of partial paraphrasing — V4's full eval
        suite will tighten the contract."""
        search_results = {"q1": ["chunks about chunking only"]}
        kws = {"q1": ["retry", "chunking"]}
        assert _hit_rate(search_results_by_question=search_results, keyword_for_question=kws) == 1.0


class TestEvalRunnerContract:
    """The runner must be importable and expose a small, stable API
    that V4's real evaluator can build on."""

    def test_runner_exposes_run_function(self):
        # The runner lives in a sibling module so V4 can import
        # it without pulling in test fixtures.
        from tests.evals import run_eval  # noqa: F401

    def test_run_eval_returns_dict_with_hit_rate(self):
        from tests.evals.run_eval import run_eval

        # Inject a fake that never matches the dataset's
        # expected keywords. The question words are returned
        # verbatim (with no expected keywords) so the hit rate
        # is deterministically 0.
        def fake_search(q: str) -> list[str]:
            return ["no relevant content here"]

        rows = _load_dataset()
        report = run_eval(
            search_fn=fake_search,
            dataset=rows,
            top_k=5,
        )
        assert isinstance(report, dict)
        assert "hit_rate" in report
        assert 0.0 <= report["hit_rate"] <= 1.0
        assert report["hit_rate"] == 0.0
        assert report["total_questions"] == len(rows)
        assert report["hits"] == 0
