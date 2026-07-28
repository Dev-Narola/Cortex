# ADR-0016: HNSW index on ``document_chunks.embedding``

**Status:** Accepted (V3)
**Date:** 2026-07-24

## Context

pgvector ships two ANN index types: **IVFFlat** and **HNSW**.
The V3 architecture specifies HNSW.

## Decision

Create the HNSW index with these defaults (configurable in
``src/core/config.py``):

| Parameter | Value | Tradeoff |
|-----------|-------|----------|
| ``m`` | 16 | Connections per node. Higher = better recall, more memory. |
| ``ef_construction`` | 64 | Build-time search width. Higher = better index quality, slower build. |
| ``ef_search`` | 40 | Query-time search width. Higher = better recall, slower query. |

Distance operator: **cosine** (``vector_cosine_ops``).

## Why these defaults

The pgvector maintainers recommend ``m=16`` and
``ef_construction=64`` as a good starting point. ``ef_search=40``
gives ~99% recall on the canonical 1M-vector SIFT benchmark; the
search service exposes it as a per-query knob so ops can tune it
without re-indexing.

The HNSW index is built once at index creation; rebuilding
(memory cost ≈ 1.5× the raw vector data) is acceptable for
``< 10M`` vectors, which is well above V3's expected scale.

## Why not IVFFlat

IVFFlat requires a *training* pass before the index is useful and
recall degrades sharply as the cluster boundaries drift. HNSW
is incremental and stable under inserts.

## Tradeoffs accepted

- **Memory:** HNSW with ``m=16`` adds ≈ 1 KB per vector. At 10M
  vectors that's 10 GB. Acceptable for V3; revisit at 100M+.
- **Build time:** indexing 1M vectors takes ~10 minutes on the
  reference hardware. Run offline; the worker does not block
  on the index.
- **No DELETE support:** HNSW in pgvector does not support
  delete-then-keep-index. Deleted chunks leave "holes" in the
  graph until a REINDEX. The V3 chunk cascade (chunk → document
  on tenant delete) is therefore eventually-consistent with
  respect to the index; for V3 we accept that and let the next
  reindex catch up.

## Consequences

- A new migration ``add_chunk_vector_hnsw_index`` (existing
  ``371b75583fd6_add_chunk_vector_columns_and_indices.py``)
  creates the index after the embedding column is added.
- ``HNSW_EF_SEARCH`` is read by the vector repository at query
  time and can be changed without reindexing.
- ``HNSW_M`` and ``HNSW_EF_CONSTRUCTION`` are only used at
  index *creation* time; changing them requires a REINDEX.
