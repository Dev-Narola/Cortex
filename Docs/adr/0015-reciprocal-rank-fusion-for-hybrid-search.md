# ADR: Reciprocal Rank Fusion (RRF) for Hybrid Search

## Status
Proposed

## Context
Our search system requires combining results from two heterogeneous retrieval methods:
1. Vector Similarity Search (semantic)
2. Full-Text Keyword Search (lexical)

These methods produce scores in different domains (cosine distance/similarity vs. BM25/`ts_rank` log-probabilities). Summing these raw scores is mathematically invalid as they are not directly comparable.

## Decision
We will use Reciprocal Rank Fusion (RRF) to combine results. RRF aggregates results based on the **rank position** rather than the raw score.

Formula: `RRF_score(d) = sum(1 / (k + rank(d, result_set)))`

Where:
- `k` is a smoothing constant (set to 60 as a default).
- `rank(d, result_set)` is the 1-based rank position of document `d` in a given result set.

## Consequences
- **Pros:**
  - Provides a normalized, comparable score across different retrieval methods.
  - Mitigates the impact of high-ranking results when using a larger `k`.
  - Simple to implement and computationally efficient.
- **Cons:**
  - Loses the granularity of raw scores (though these are still preserved for inspection/reranking).
