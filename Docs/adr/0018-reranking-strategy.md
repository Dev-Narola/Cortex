# ADR-0018: Two-stage retrieval (first-stage + rerank)

**Status:** Accepted (V3)
**Date:** 2026-07-24

## Context

Vector + keyword first-stage retrieval returns ``final_top_k``
(default 5) chunks. But cosine similarity and ts_rank are
*approximations* of relevance. A cross-encoder reranker
applied to the top-K can re-score the candidates using a
much more expensive model and surface a better ordering.

## Decision

Cortex runs a **two-stage** retrieval:

1. **First stage** (HybridSearchService): pgvector + Postgres
   FTS, fused with RRF, returns up to ``rerank_top_k`` (= 20)
   candidates.
2. **Second stage** (RerankerService): a cross-encoder
   reranker re-scores those 20 candidates, returns the
   top ``final_top_k`` (= 5).

The first stage is the cheap "recall" pass; the second is the
expensive "precision" pass. This is the standard
funnel-and-rerank pattern from information retrieval.

### Why not rerank the whole database

Reranking is per-query expensive (one forward pass per
candidate through a cross-encoder). With 1M chunks that's
a million forward passes per query — not viable.

The first-stage retriever is *ann*; it can scan the whole
corpus cheaply and surface a small "probably relevant"
shortlist. The reranker spends its budget on that shortlist
and produces a high-quality ordering.

### Why a 50 → 30 → 20 → 5 funnel

| Stage | Limit | Rationale |
|-------|-------|-----------|
| Vector retriever | 50 | pgvector HNSW recall at top-50 is high; cheap |
| Keyword retriever | 50 | Postgres FTS at top-50 is high; cheap |
| After RRF | 30 | Drop the long tail before rerank |
| After rerank | 5 | What the user sees |

The ``50 → 30 → 20 → 5`` numbers are configurable; they live
in ``src/core/config.py`` as ``VECTOR_TOP_K`` /
``KEYWORD_TOP_K`` / ``FUSION_TOP_K`` / ``RERANK_TOP_K`` /
``FINAL_TOP_K``.

### Failure policy

If the reranker raises, ``RerankerService`` logs and returns
the fused list unchanged. Search stays up; the user just gets
the cheaper ordering. The ``last_rerank_succeeded`` flag on
``RerankerService`` lets the route layer surface the
degradation in the ``/search/debug`` response.

## Consequences

- The ``RerankerPort`` is a Protocol — V3 ships an
  ``IdentityReranker`` (the no-op fallback). A real Cohere or
  local cross-encoder adapter plugs in via the same port, no
  application-layer change.
- The first-stage retriever does *not* know the reranker
  exists. This is a feature: the two stages can be
  independently scaled, cached, and benchmarked.
- The cost of reranking scales with the number of candidates,
  not the corpus size. At 1M chunks, the rerank cost is
  ~20 forward passes per query — cheap.
