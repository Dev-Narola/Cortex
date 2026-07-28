# ADR-0017: Hybrid search with Reciprocal Rank Fusion

**Status:** Accepted (V3)
**Date:** 2026-07-24

## Context

Pure-vector search misses things that don't share semantic
embedding with the query. Pure-keyword search misses things
the user paraphrased. The V3 architecture therefore specifies
*hybrid* retrieval: vector + keyword, fused with RRF, then
reranked.

## Decision

Cortex's hybrid search runs two retrievers in parallel and
fuses their results with **Reciprocal Rank Fusion** (RRF).

### RRF formula

```
RRF(d) = 1 / (k + rank_vector(d))  +  1 / (k + rank_keyword(d))
```

with ``k = 60`` (the canonical default; configurable in
``src/core/config.py``).

### Why not raw score addition

Vector cosine similarity lives in ``[0, 1]``. Postgres
``ts_rank`` returns arbitrary positive numbers, often
single-digit. Adding them is meaningless:

```
vector score = 0.83
keyword score = 17.4
0.83 + 17.4 = 18.23  ← uninterpretable
```

Normalising the keyword score into ``[0, 1]`` works, but the
*scale* is fundamentally different (cosine is geometric
similarity, ts_rank is term-frequency in the matched docs).
RRF sidesteps this by working on **ranks**, not scores — a
chunk that ranks 1st in vector and 3rd in keyword still beats
a chunk that ranks 2nd and 2nd, because position matters
more than absolute score.

### Why not CombMNZ or Borda

Both are valid alternatives. RRF is the simplest and the
empirically best-performing across the RRF paper's benchmarks.
Cortex doesn't have a benchmarking team to validate a more
exotic fusion function, so we pick the boring, well-tested one.

## Consequences

- The fusion function is order-aware but score-agnostic; the
  per-stage scores (``vector_score``, ``keyword_score``,
  ``fusion_score``) are still recorded on every
  ``SearchResult`` for debugging and for the ``/search/debug``
  endpoint.
- A chunk retrieved by *only* one retriever still gets a
  fusion score (``1 / (k + rank)`` for the single retriever
  that found it). It is never silently dropped.
- The two retrievers can run independently — the V3
  ``HybridSearchService`` calls them sequentially today, but
  the structure is ready for ``asyncio.gather`` once we have
  real concurrency targets.
