"""
V4 Phase 24 — regression runner tests.

The runner compares two :class:`EvalReport`-shaped
JSON files (typically the V4-baseline JSON and the
*current* run) and emits a verdict. The tests below
exercise the runner with hand-built JSON dicts so
the assertions are deterministic and the test
doesn't depend on the V4 dataset existing.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from src.evaluation.application.regression_runner import (
    DEFAULT_TOLERANCE,
    RegressionVerdict,
    compare,
)


def _write(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def test_compare_pass(tmp_path: Path) -> None:
    base = tmp_path / "base.json"
    cur = tmp_path / "cur.json"
    _write(
        base,
        {
            "suite": "retrieval",
            "metrics": {
                "recall_at_k": 0.80,
                "mrr": 0.70,
                "hit_rate_at_k": 0.90,
            },
        },
    )
    _write(
        cur,
        {
            "suite": "retrieval",
            "metrics": {
                "recall_at_k": 0.81,
                "mrr": 0.71,
                "hit_rate_at_k": 0.91,
            },
        },
    )
    verdict = compare(base, cur, tolerance=0.05)
    assert not verdict.is_regression
    assert not verdict.has_improvement
    assert all(
        abs(d.delta) <= 0.05 for d in verdict.deltas
    )


def test_compare_regression(tmp_path: Path) -> None:
    base = tmp_path / "base.json"
    cur = tmp_path / "cur.json"
    _write(
        base,
        {
            "suite": "retrieval",
            "metrics": {"recall_at_k": 0.80, "mrr": 0.70},
        },
    )
    _write(
        cur,
        {
            "suite": "retrieval",
            "metrics": {"recall_at_k": 0.65, "mrr": 0.70},
        },
    )
    verdict = compare(base, cur, tolerance=0.05)
    assert verdict.is_regression
    # The ``recall_at_k`` delta is -0.15, well past the
    # 0.05 tolerance.
    recall_delta = next(
        d for d in verdict.deltas if d.metric == "recall_at_k"
    )
    assert recall_delta.delta == pytest.approx(-0.15, abs=1e-9)
    assert recall_delta.is_regression


def test_compare_improvement(tmp_path: Path) -> None:
    base = tmp_path / "base.json"
    cur = tmp_path / "cur.json"
    _write(
        base,
        {
            "suite": "retrieval",
            "metrics": {"recall_at_k": 0.60, "mrr": 0.50},
        },
    )
    _write(
        cur,
        {
            "suite": "retrieval",
            "metrics": {"recall_at_k": 0.75, "mrr": 0.55},
        },
    )
    verdict = compare(base, cur, tolerance=0.05)
    assert not verdict.is_regression
    assert verdict.has_improvement


def test_compare_handles_v4_results_shape(tmp_path: Path) -> None:
    """The runner accepts the V4 ``evals/results/...``
    JSON shape (a top-level ``reports`` list)."""
    base = tmp_path / "base.json"
    cur = tmp_path / "cur.json"
    _write(
        base,
        {
            "suite": "retrieval",
            "generated_at": "2026-07-25T00:00:00Z",
            "git_commit": "abc1234",
            "reports": [
                {
                    "suite": "retrieval",
                    "metrics": {"recall_at_k": 0.80, "mrr": 0.70},
                }
            ],
        },
    )
    _write(
        cur,
        {
            "suite": "retrieval",
            "generated_at": "2026-07-26T00:00:00Z",
            "git_commit": "def5678",
            "reports": [
                {
                    "suite": "retrieval",
                    "metrics": {"recall_at_k": 0.81, "mrr": 0.71},
                }
            ],
        },
    )
    verdict = compare(base, cur)
    assert isinstance(verdict, RegressionVerdict)
    assert verdict.suite == "retrieval"
    assert not verdict.is_regression


def test_compare_extra_metric_in_current(tmp_path: Path) -> None:
    """A metric that exists in ``current`` but not in
    ``baseline`` is diffed against zero. The runner
    surfaces it as a delta so a future V5 metric
    addition doesn't silently hide regressions."""
    base = tmp_path / "base.json"
    cur = tmp_path / "cur.json"
    _write(
        base,
        {"suite": "retrieval", "metrics": {"recall_at_k": 0.80}},
    )
    _write(
        cur,
        {
            "suite": "retrieval",
            "metrics": {
                "recall_at_k": 0.80,
                "ndcg_at_10": 0.60,
            },
        },
    )
    verdict = compare(base, cur)
    metrics = {d.metric for d in verdict.deltas}
    assert "ndcg_at_10" in metrics


def test_verdict_to_text_includes_verdict_line() -> None:
    v = RegressionVerdict(
        suite="retrieval",
        deltas=[],
        tolerance=DEFAULT_TOLERANCE,
    )
    text = v.to_text()
    assert "VERDICT: PASS" in text
    assert "retrieval" in text


def test_missing_file_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        compare(tmp_path / "missing.json", tmp_path / "cur.json")
