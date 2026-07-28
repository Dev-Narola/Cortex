"""
Retrieval metrics — the V4 scoring primitives.

Each metric is a pure function on a list of retrieved
hits and a set of relevant ids. No I/O, no state, no
async — easy to unit-test, easy to compose.

Definitions (per Phase 16 of the V4 brief):

* **Recall@K** — fraction of relevant items that
  appear in the top K.
* **Precision@K** — fraction of the top K that are
  relevant.
* **Hit Rate@K** — 1.0 if at least one relevant item
  appears in the top K, else 0.0.
* **MRR** — Mean Reciprocal Rank; the *position* of
  the first relevant result, with rank 1 → 1.0,
  rank 2 → 0.5, rank 3 → 0.333, etc. Misses count as 0.

The string-match fallback (V3 compatibility) lives in
:func:`keyword_hit` — it returns True if any of the
case's ``expected_keywords`` appears in any of the
retrieved chunks' content. This keeps the V3 hit-rate
test in the green while V4 grows the full metric set.
"""

from __future__ import annotations

from typing import Iterable


def _relevant_set(case) -> set[str]:
    """Build a comparable set of relevant ids.

    The V4 case carries both ``relevant_chunk_ids`` and
    ``relevant_document_ids``. For chunk-level metrics
    we prefer chunk ids when present, falling back to
    document ids otherwise. Document-level metrics
    always use the document set.
    """
    if case.relevant_chunk_ids:
        return {str(x) for x in case.relevant_chunk_ids}
    return {str(x) for x in case.relevant_document_ids}


def _relevant_doc_set(case) -> set[str]:
    return {str(x) for x in case.relevant_document_ids}


def recall_at_k(
    retrieved: Iterable[str],
    relevant: Iterable[str],
    *,
    k: int,
) -> float:
    """Fraction of relevant items covered by the top K.

    Counts each relevant item at most once — a hit
    list with three duplicates of the same relevant
    document contributes 1/len(relevant), not 3.

    Returns 0.0 if there are no relevant items (the
    question is ill-formed; we don't divide by zero).
    """
    rel = set(relevant)
    if not rel:
        return 0.0
    top = list(retrieved)[:k]
    if not top:
        return 0.0
    seen: set[str] = set()
    for x in top:
        if x in rel:
            seen.add(x)
    return len(seen) / len(rel)


def precision_at_k(
    retrieved: Iterable[str],
    relevant: Iterable[str],
    *,
    k: int,
) -> float:
    """Fraction of the top K that are relevant.

    Returns 0.0 if K is 0 (callers must enforce K >= 1).
    """
    if k <= 0:
        return 0.0
    rel = set(relevant)
    top = list(retrieved)[:k]
    if not top:
        return 0.0
    return sum(1 for x in top if x in rel) / len(top)


def hit_rate_at_k(
    retrieved: Iterable[str],
    relevant: Iterable[str],
    *,
    k: int,
) -> float:
    """1.0 if at least one relevant appears in the top K."""
    rel = set(relevant)
    if not rel:
        return 0.0
    return float(any(x in rel for x in list(retrieved)[:k]))


def mean_reciprocal_rank(
    retrieved: Iterable[str],
    relevant: Iterable[str],
) -> float:
    """
    Reciprocal rank of the *first* relevant result.

    1-indexed (rank 1 → 1.0; rank 2 → 0.5; rank N →
    1/N). Returns 0.0 if no relevant result appears.
    The function is *not* parameterised by K — MRR is
    defined over the entire returned list, since the
    first relevant could in principle be at any rank.
    """
    rel = set(relevant)
    if not rel:
        return 0.0
    for i, x in enumerate(retrieved, start=1):
        if x in rel:
            return 1.0 / i
    return 0.0


def keyword_hit(
    retrieved_contents: Iterable[str],
    expected_keywords: Iterable[str],
) -> bool:
    """V3 fallback: any expected keyword in any chunk?"""
    expected = [k.lower() for k in expected_keywords if k]
    if not expected:
        return False
    joined = " ".join(retrieved_contents).lower()
    return any(kw in joined for kw in expected)


def aggregate_metrics(
    per_case: list[dict[str, float]],
) -> dict[str, float]:
    """
    Average the per-case metric dicts into a single
    summary dict. Returns 0.0 for each metric if the
    list is empty.
    """
    if not per_case:
        return {
            "recall_at_k": 0.0,
            "precision_at_k": 0.0,
            "hit_rate_at_k": 0.0,
            "mrr": 0.0,
            "keyword_hit_rate": 0.0,
        }
    keys = ("recall_at_k", "precision_at_k", "hit_rate_at_k", "mrr", "keyword_hit_rate")
    out: dict[str, float] = {}
    n = float(len(per_case))
    for k in keys:
        out[k] = sum(c.get(k, 0.0) for c in per_case) / n
    return out


__all__ = [
    "aggregate_metrics",
    "hit_rate_at_k",
    "keyword_hit",
    "mean_reciprocal_rank",
    "precision_at_k",
    "recall_at_k",
]
