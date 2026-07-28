"""
Minimal V3 retrieval-eval runner.

A real evaluation suite (V4) will load this module and call
``run_eval`` with a real ``search_fn``. V3's tests/evals just
need a stable contract to lock down.

The runner is intentionally tiny:

* A ``search_fn(question) -> list[str]`` callable is passed in.
  The default contract is a list of chunk-content strings, but
  any callable works (the runner only uses the string contents).
* ``top_k`` is for documentation; the runner consumes whatever
  the search function returns.
* Output is a dict so V4 can extend it (e.g. add MRR, recall@k,
  faithfulness) without breaking the V3 surface.
"""

from __future__ import annotations

from typing import Any, Callable


def run_eval(
    *,
    search_fn: Callable[[str], list[str]],
    dataset: list[dict[str, Any]],
    top_k: int = 5,
) -> dict[str, Any]:
    """
    Run a minimal retrieval hit-rate eval.

    Args:
        search_fn: callable mapping a question to a list of chunk
            contents (top-k).
        dataset: list of dicts with at least ``question`` and
            ``expected_keywords`` keys.
        top_k: documented limit; the runner doesn't enforce it
            (search_fn decides how many to return).

    Returns:
        ``{"hit_rate": float, "total_questions": int, "hits": int}``
    """
    if not dataset:
        return {"hit_rate": 0.0, "total_questions": 0, "hits": 0}

    hits = 0
    for row in dataset:
        question = str(row.get("question", ""))
        kws = row.get("expected_keywords") or []
        if not question or not kws:
            continue
        chunks = search_fn(question)
        joined = " ".join(chunks).lower()
        if any(str(kw).lower() in joined for kw in kws):
            hits += 1

    return {
        "hit_rate": hits / len(dataset),
        "total_questions": len(dataset),
        "hits": hits,
    }


__all__ = ["run_eval"]
