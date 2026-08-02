"""Performance regression tests.

V9 Part 4, Task 41.

Each test runs the corresponding benchmark suite from
``benchmarks/`` and asserts the latency is within 15% of
the recorded baseline. The baseline lives in
``benchmarks/baselines/<suite>.json`` and is updated by
the release pipeline after a successful release.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from benchmarks import run


BASELINE_DIR = Path("benchmarks/baselines")
REGRESSION_THRESHOLD = 0.15  # 15%


def _baseline_path(suite: str) -> Path:
    return BASELINE_DIR / f"{suite}.json"


def _load_baseline(suite: str) -> dict[str, float] | None:
    path = _baseline_path(suite)
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


SUITES = [
    "knowledge_search",
    "graph_traversal",
    "embedding_retrieval",
    "agent_execution",
    "mcp_tool_execution",
    "memory_retrieval",
]


class TestBenchmarkRegression:
    @pytest.mark.parametrize("suite", SUITES)
    async def test_suite_p95_within_threshold(self, suite: str) -> None:
        """Each benchmark suite must be within 15% of its baseline P95."""
        baseline = _load_baseline(suite)
        if baseline is None:
            pytest.skip(f"no baseline for {suite}")
        result = await run(suite, iterations=50)
        baseline_p95 = baseline["p95_ms"]
        delta = (result.p95_ms - baseline_p95) / baseline_p95
        assert delta <= REGRESSION_THRESHOLD, (
            f"{suite} P95 regression: "
            f"baseline={baseline_p95:.2f}ms current={result.p95_ms:.2f}ms "
            f"delta={delta * 100:.1f}%"
        )

    @pytest.mark.parametrize("suite", SUITES)
    async def test_suite_throughput_within_threshold(self, suite: str) -> None:
        """Each benchmark suite must sustain >= 85% of its baseline throughput."""
        baseline = _load_baseline(suite)
        if baseline is None:
            pytest.skip(f"no baseline for {suite}")
        result = await run(suite, iterations=50)
        baseline_tput = baseline["throughput_per_sec"]
        assert result.throughput_per_sec >= baseline_tput * 0.85, (
            f"{suite} throughput regression: "
            f"baseline={baseline_tput:.1f}/s current={result.throughput_per_sec:.1f}/s"
        )


def test_all_suites_registered() -> None:
    """Sanity check: every named suite must be registered with the harness."""
    from benchmarks import available_suites

    available = set(available_suites())
    for suite in SUITES:
        assert suite in available, f"benchmark suite {suite!r} not registered"
