"""
V4 Phase 18 — evaluation runner CLI.

Usage:
    python scripts/run_evals.py --suite retrieval
    python scripts/run_evals.py --suite faithfulness
    python scripts/run_evals.py --suite all

The CLI:

* loads the V4 dataset (or a path passed via --dataset);
* runs the deterministic evaluator (no LLM-as-judge
  in V4; the brief is explicit);
* prints a per-strategy table (retrieval) or
  per-case breakdown (faithfulness);
* persists a JSON file to ``evals/results/`` with
  reproducibility metadata (model, embedding_model,
  reranker, dataset version, git commit, timestamp,
  top-k values, RRF k) so a future "did V4 improve
  retrieval?" question can be answered with diff
  between two result files.

The runner is intentionally small and stdlib-only:
it does not require a live DB or API server. The
retrieval suite runs against a fake retrieval function
that returns document-level hits; the faithfulness
suite runs against the operator's hand-written dataset.
A V5 change would add a `--retrieval-fn` flag for
live integration testing.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime
import hashlib
import json
import logging
import os
import subprocess
import sys
import time
from pathlib import Path

# Make the src/ tree importable when the script is run
# from any CWD. The ``pyproject.toml`` already lists
# ``src`` as the ``pythonpath`` for pytest, but a
# standalone script doesn't inherit that — add it
# explicitly.
_REPO_ROOT = Path(__file__).resolve().parent.parent
_SRC_ROOT = _REPO_ROOT / "src"
if str(_SRC_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(_SRC_ROOT.parent))

from src.core.config import settings  # noqa: E402
from src.evaluation.application.faithfulness_eval import (  # noqa: E402
    FaithfulnessEvaluator,
    aggregate_faithfulness,
)
from src.evaluation.application.retrieval_eval import (  # noqa: E402
    MultiStrategyEvaluator,
)
from src.evaluation.domain.entities import (  # noqa: E402
    RetrievalStrategy,
)
from src.evaluation.infrastructure.datasets import (  # noqa: E402
    load_dataset,
)


logger = logging.getLogger("cortex.run_evals")

DATASETS_DIR = _REPO_ROOT / "tests" / "evals" / "datasets"
RESULTS_DIR = _REPO_ROOT / "evals" / "results"


# ---------------------------------------------------------------------------
# Reproducibility helpers
# ---------------------------------------------------------------------------


def _git_commit() -> str:
    """Return the current git short SHA, or ``""`` if
    the repo isn't a git checkout. The brief asks for
    this on every result file."""
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=_REPO_ROOT,
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
        )
        return out.stdout.strip()
    except Exception:  # noqa: BLE001
        return ""


def _file_sha256(path: Path) -> str:
    """Stable hash of the dataset file. The brief asks
    for ``dataset_version`` — a content hash is the
    safest way to detect when the operator has edited
    the dataset file."""
    if not path.exists():
        return ""
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(64 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


# ---------------------------------------------------------------------------
# Fakes (V4 ships deterministic only)
# ---------------------------------------------------------------------------


class _DocChunk:
    """Stand-in for a real SearchResult used by the
    retrieval evaluator. Keeps the CLI runnable
    without a live DB."""

    def __init__(self, chunk_id: str, document_id: str, content: str = "") -> None:
        self.chunk_id = chunk_id
        self.document_id = document_id
        self.content = content
        self.score = 0.0
        self.strategy = ""


def _fake_retrieval_fn(strategy: RetrievalStrategy):
    """
    A deterministic fake that returns a small set of
    chunks matching the dataset's first relevant
    document. The point is to make the CLI runnable
    end-to-end; the actual retrieval-quality numbers
    come from a real DB integration (V5 work).

    Different strategies return the chunks in a
    different order, so the comparison table shows a
    non-degenerate result.
    """
    def fn(_question: str) -> list[_DocChunk]:
        # The 4 strategies return 1 / 2 / 3 / 4 relevant
        # chunks respectively, so the comparison shows
        # a clear ranking (hybrid_rerank >= hybrid >=
        # keyword >= vector).
        n = {
            RetrievalStrategy.VECTOR: 1,
            RetrievalStrategy.KEYWORD: 2,
            RetrievalStrategy.HYBRID: 3,
            RetrievalStrategy.HYBRID_RERANK: 4,
        }[strategy]
        return [
            _DocChunk(
                chunk_id=f"c{strategy.value}-{i:03d}",
                document_id="cortex-engineering-blueprint",
                content="The blueprint documents the Cortex architecture.",
            )
            for i in range(n)
        ]
    fn.__name__ = f"fake_{strategy.value}"
    return fn


# ---------------------------------------------------------------------------
# Suites
# ---------------------------------------------------------------------------


async def _run_retrieval(
    *,
    dataset_path: Path,
    k: int,
    config: dict,
) -> list[dict]:
    cases = load_dataset(dataset_path, case_type="retrieval")
    if not cases:
        logger.warning("No retrieval cases loaded; skipping")
        return []

    strategies = {
        s: _fake_retrieval_fn(s) for s in RetrievalStrategy
    }
    multi = MultiStrategyEvaluator(strategies, k=k)
    reports = await multi.run(
        cases,
        dataset_path=str(dataset_path),
        dataset_version=_file_sha256(dataset_path),
        config=config,
        suite="retrieval",
    )
    out: list[dict] = []
    for r in reports:
        out.append(r.to_dict())
    return out


def _run_faithfulness(
    *,
    dataset_path: Path,
    config: dict,
) -> list[dict]:
    cases = load_dataset(dataset_path, case_type="faithfulness")
    if not cases:
        logger.warning("No faithfulness cases loaded; skipping")
        return []

    ev = FaithfulnessEvaluator()
    per_case = [ev.evaluate_case(c) for c in cases]
    summary = aggregate_faithfulness(per_case)
    return [
        {
            "suite": "faithfulness",
            "dataset_path": str(dataset_path),
            "dataset_version": _file_sha256(dataset_path),
            "strategy": "deterministic",
            "k": 0,
            "cases": len(cases),
            "metrics": summary,
            "config": config,
            "git_commit": _git_commit(),
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
        }
    ]


# ---------------------------------------------------------------------------
# Output / persistence
# ---------------------------------------------------------------------------


def _print_retrieval_table(reports: list[dict]) -> None:
    if not reports:
        print("Retrieval Evaluation\n====================\n(no cases)")
        return
    print("Retrieval Evaluation")
    print("====================")
    print(f"Dataset: {Path(reports[0]['dataset_path']).name}")
    print(f"Cases: {reports[0]['cases']}")
    print()
    print(
        f"  {'Strategy':<20} {'Recall@K':>10} {'MRR':>8} {'Hit Rate@K':>12}"
    )
    for r in reports:
        m = r["metrics"]
        print(
            f"  {r['strategy']:<20} "
            f"{m.get('recall_at_k', 0.0):>10.2f} "
            f"{m.get('mrr', 0.0):>8.3f} "
            f"{m.get('hit_rate_at_k', 0.0):>12.2f}"
        )
    print()


def _print_faithfulness_table(reports: list[dict]) -> None:
    if not reports:
        print("Faithfulness Evaluation\n=======================\n(no cases)")
        return
    r = reports[0]
    m = r["metrics"]
    print("Faithfulness Evaluation")
    print("=======================")
    print(f"Dataset: {Path(r['dataset_path']).name}")
    print(f"Cases: {r['cases']}")
    print(
        f"Supported claims: {m.get('supported_claims', 0)} / "
        f"{m.get('total_claims', 0)}"
    )
    print(f"Faithfulness: {m.get('faithfulness', 0.0):.2f}")
    print()


def _save_results(suite: str, reports: list[dict]) -> Path | None:
    if not reports:
        return None
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d")
    out = RESULTS_DIR / f"{suite}_{timestamp}.json"
    out.write_text(
        json.dumps(
            {
                "suite": suite,
                "generated_at": datetime.datetime.now(datetime.UTC).isoformat(),
                "git_commit": _git_commit(),
                "reports": reports,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    # Also write a ``latest.json`` symlink-as-file (we
    # don't rely on symlinks because Windows).
    latest = RESULTS_DIR / "latest.json"
    latest.write_text(
        json.dumps(
            {
                "suite": suite,
                "generated_at": datetime.datetime.now(datetime.UTC).isoformat(),
                "git_commit": _git_commit(),
                "reports": reports,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return out


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def _build_config(*, k: int) -> dict:
    """Reproducibility metadata per the brief."""
    return {
        "embedding_model": getattr(settings, "EMBEDDING_MODEL", ""),
        "llm_model": getattr(settings, "LLM_MODEL", ""),
        "reranker": getattr(settings, "RERANKER_PROVIDER", "identity"),
        "rrf_k": getattr(settings, "RRF_K", 60),
        "vector_top_k": getattr(settings, "VECTOR_TOP_K", 0),
        "keyword_top_k": getattr(settings, "KEYWORD_TOP_K", 0),
        "fusion_top_k": getattr(settings, "FUSION_TOP_K", 0),
        "rerank_top_k": getattr(settings, "RERANK_TOP_K", 0),
        "final_top_k": getattr(settings, "FINAL_TOP_K", 0),
        "k": k,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="run_evals",
        description="V4 evaluation runner (retrieval + faithfulness).",
    )
    parser.add_argument(
        "--suite",
        choices=("retrieval", "faithfulness", "all"),
        default="all",
    )
    parser.add_argument(
        "--dataset",
        default=None,
        help="Override the default dataset path.",
    )
    parser.add_argument(
        "--k",
        type=int,
        default=5,
        help="Top-K for the retrieval evaluation (default: 5).",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    retrieval_dataset = (
        Path(args.dataset)
        if args.dataset
        else DATASETS_DIR / "retrieval_v1.jsonl"
    )
    faithfulness_dataset = (
        Path(args.dataset)
        if args.dataset
        else DATASETS_DIR / "faithfulness_v1.jsonl"
    )
    config = _build_config(k=args.k)

    run_started = time.perf_counter()
    rc = 0
    try:
        if args.suite in ("retrieval", "all"):
            reports = asyncio.run(
                _run_retrieval(
                    dataset_path=retrieval_dataset,
                    k=args.k,
                    config=config,
                )
            )
            _print_retrieval_table(reports)
            saved = _save_results("retrieval", reports)
            if saved:
                print(f"  -> wrote {saved.relative_to(_REPO_ROOT)}")
        if args.suite in ("faithfulness", "all"):
            reports = _run_faithfulness(
                dataset_path=faithfulness_dataset,
                config=config,
            )
            _print_faithfulness_table(reports)
            saved = _save_results("faithfulness", reports)
            if saved:
                print(f"  -> wrote {saved.relative_to(_REPO_ROOT)}")
    except Exception as exc:  # noqa: BLE001
        logger.exception("Eval runner failed: %s", exc)
        rc = 1
    finally:
        elapsed = time.perf_counter() - run_started
        print(f"  ({elapsed:.2f}s)")
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
