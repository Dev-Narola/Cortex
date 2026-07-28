# ADR 0014: Reciprocal Rank Fusion (RRF) for Hybrid Search

## Status
Proposed

## Context
In V3 of Cortex, we are implementing hybrid search, which combines semantic vector search (via pgvector) with traditional full-text keyword search (via PostgreSQL's `tsvector`). 

The primary challenge in hybrid search is how to combine the scores from these two fundamentally different retrieval methods:
1. **Vector search** produces a distance or similarity score (e.g., cosine similarity in the range [0, 1]).
2. **Full-text search** produces a relevance score (e.g., `ts_rank` which can be any positive floating-point number, often > 1).

Directly adding or averaging these raw scores is meaningless because they operate on different scales and distributions.

## Decision
We will use **Reciprocal Rank Fusion (RRF)** to combine the results from vector search and full-text search.

RRF calculates a new score for each document based on its rank in the individual result sets rather than its raw score:

`RRF_score(d) = sum(1 / (k + rank(d, result_set)))`

Where:
- `d` is a document (or chunk).
- `result_set` is one of the ranked lists (vector or keyword).
- `rank(d, result_set)` is the 1-based position of document `d` in that list.
- `k` is a smoothing constant (typically 60).

## Consequences
- **Scale Independence:** RRF is agnostic to the underlying scoring mechanisms, making it safe to combine any number of retrieval signals.
- **Simplicity:** It requires no normalization or complex parameter tuning beyond the constant `k`.
- **Fairness:** Documents that appear in the top results of *any* list are rewarded, and those that appear in *multiple* lists are prioritized highly.
- **Performance:** Fusing ranked lists is computationally inexpensive compared to the retrieval itself.
- **Interpretability:** While the raw RRF score is not a probability, the logic for *why* a document is ranked highly (it was rank X in vector and rank Y in keyword) is easy to explain.

## Alternatives Considered
- **Linear Combination (Weighted Sum):** Requires normalizing both scores to a common range (0-1) and choosing weights. This is brittle because `ts_rank` distribution changes based on the query and corpus size, making normalization difficult to maintain.
- **Rank-based Borda Count:** Similar to RRF but less effective at prioritizing the very top results.
