"""
Regression runner — V4 Phase 24.

Diff two :class:`EvalReport` files (typically the
*current* run and the *baseline* run) and emit a
human-readable verdict.

The brief: "Do not force every metric to improve
every time. Instead, define a reasonable regression
tolerance."

The runner reads a baseline file
(``tests/evals/datasets/retrieval_v1_baseline.json``
or any other path) and a current file (the output
of :mod:`scripts.run_evals`), compares every
``metric`` key in both, and reports either:

* ``PASS`` — every metric is within the configured
  tolerance of the baseline;
* ``REGRESSION`` — at least one metric dropped by
  more than the tolerance;
* ``IMPROVEMENT`` — at least one metric improved by
  more than the tolerance (and no regressions).

The runner never raises. A regression is a signal
to the operator; the test suite that consumes the
runner converts the verdict into a pytest
``fail`` so the CI catches a real regression.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


# Default tolerance. 5 percentage points is large
# enough to ignore a single re-shuffled top-K and
# small enough to catch a real algorithm regression.
DEFAULT_TOLERANCE: float = 0.05


@dataclass(frozen=True)
class MetricDelta:
    metric: str
    baseline: float
    current: float
    delta: float

    @property
    def is_regression(self) -> bool:
        return self.delta < -DEFAULT_TOLERANCE

    @property
    def is_improvement(self) -> bool:
        return self.delta > DEFAULT_TOLERANCE


@dataclass(frozen=True)
class RegressionVerdict:
    suite: str
    deltas: list[MetricDelta]
    tolerance: float

    @property
    def is_regression(self) -> bool:
        return any(d.is_regression for d in self.deltas)

    @property
    def has_improvement(self) -> bool:
        return any(d.is_improvement for d in self.deltas)

    def to_dict(self) -> dict[str, Any]:
        return {
            "suite": self.suite,
            "tolerance": self.tolerance,
            "is_regression": self.is_regression,
            "has_improvement": self.has_improvement,
            "deltas": [
                {
                    "metric": d.metric,
                    "baseline": d.baseline,
                    "current": d.current,
                    "delta": d.delta,
                }
                for d in self.deltas
            ],
        }

    def to_text(self) -> str:
        """A short, log-friendly summary."""
        lines = [f"Suite: {self.suite} (tolerance={self.tolerance:.2f})"]
        for d in self.deltas:
            tag = ""
            if d.is_regression:
                tag = "  <-- REGRESSION"
            elif d.is_improvement:
                tag = "  <-- IMPROVEMENT"
            lines.append(
                f"  {d.metric:<20}  baseline={d.baseline:.3f}  "
                f"current={d.current:.3f}  delta={d.delta:+.3f}{tag}"
            )
        if self.is_regression:
            lines.append("VERDICT: REGRESSION")
        elif self.has_improvement:
            lines.append("VERDICT: IMPROVEMENT")
        else:
            lines.append("VERDICT: PASS")
        return "\n".join(lines)


def _load_report(path: str | Path) -> dict[str, Any]:
    """Load an :class:`EvalReport`-shaped JSON file.

    The runner accepts both the V4 ``evals/results/...``
    shape (a list of reports under ``reports``) and the
    V3 "single dict with a ``metrics`` key" shape.
    """
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Result file not found: {p}")
    raw = json.loads(p.read_text(encoding="utf-8"))
    if "reports" in raw and isinstance(raw["reports"], list):
        # V4 shape: pick the first report.
        return raw["reports"][0]
    if "metrics" in raw:
        return raw
    raise ValueError(
        f"Result file {p} has neither 'reports' nor 'metrics' key"
    )


def compare(
    baseline_path: str | Path,
    current_path: str | Path,
    *,
    tolerance: float = DEFAULT_TOLERANCE,
) -> RegressionVerdict:
    """
    Diff a baseline result file against a current one.

    The returned :class:`RegressionVerdict` carries every
    metric as a :class:`MetricDelta`; the
    ``is_regression`` property is the operator's
    yes/no answer.
    """
    base = _load_report(baseline_path)
    cur = _load_report(current_path)

    base_metrics = dict(base.get("metrics", {}))
    cur_metrics = dict(cur.get("metrics", {}))

    deltas: list[MetricDelta] = []
    # Iterate over the union of the two metric sets, so
    # a future metric added to one side surfaces as a
    # delta against zero.
    for metric in sorted(set(base_metrics) | set(cur_metrics)):
        b = float(base_metrics.get(metric, 0.0))
        c = float(cur_metrics.get(metric, 0.0))
        deltas.append(
            MetricDelta(
                metric=metric,
                baseline=b,
                current=c,
                delta=c - b,
            )
        )

    return RegressionVerdict(
        suite=cur.get("suite", base.get("suite", "unknown")),
        deltas=deltas,
        tolerance=tolerance,
    )


__all__ = [
    "DEFAULT_TOLERANCE",
    "MetricDelta",
    "RegressionVerdict",
    "compare",
]
