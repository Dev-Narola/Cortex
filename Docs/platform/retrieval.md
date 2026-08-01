# Retrieval Module

V9 Part 4, Task 47.

## Purpose

Hybrid retrieval combining vector search (pgvector HNSW),
BM25 full-text search, and Reciprocal Rank Fusion. Provides
the unified `HybridSearchService` used by the RAG pipeline.

## Architecture

```
retrieval/
├── domain/
│   ├── entities.py        # SearchResult, SearchQuery
│   └── value_objects.py   # Score, SearchMode
├── application/
│   ├── query/             # HybridSearchService, RRF, Reranker
│   └── services.py        # backward-compat shim
├── infrastructure/
│   ├── query/             # Vector + full-text repositories
│   └── reranker.py        # IdentityReranker
└── interface/
    ├── rest/              # /search
    └── dependencies.py
```

## Public interfaces

* `POST /api/v1/search` — search the corpus
* `POST /api/v1/answer` — RAG pipeline (search + LLM answer)
* `GET /api/v1/chunks/{id}` — fetch a chunk by id

## Configuration

| Key | Default | Description |
| --- | --- | --- |
| `VECTOR_TOP_K` | 50 | Vector candidate pool |
| `KEYWORD_TOP_K` | 50 | BM25 candidate pool |
| `FUSION_TOP_K` | 30 | Post-fusion pool |
| `RERANK_TOP_K` | 20 | Reranker input |
| `FINAL_TOP_K` | 5 | API response size |
| `RRF_K` | 60 | RRF smoothing constant |
| `HNSW_M` | 16 | HNSW graph degree |
| `HNSW_EF_CONSTRUCTION` | 64 | HNSW build ef |
| `HNSW_EF_SEARCH` | 40 | HNSW query ef |

## Dependencies

* `pgvector` — vector column type + HNSW
* `sqlalchemy` — query layer
* `openai` — embedding provider (configurable)

## Extension points

* New retrieval mode: subclass `HybridSearchService`
  and override `search()`.
* New reranker: implement
  `retrieval.domain.interfaces.Reranker` and wire it in
  `core/dependencies.py`.
* New embedding provider: implement
  `embedding.domain.interfaces.EmbeddingProvider`.
