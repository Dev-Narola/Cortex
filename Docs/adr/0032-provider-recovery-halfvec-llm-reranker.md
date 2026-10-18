# ADR-0032: Recovering from retired NIM models — halfvec(2048) embeddings and an LLM reranker

**Status:** Accepted
**Date:** 2026-10-18

## Context

On 2026-10-18 production could not ingest, search, or chat:

- `nvidia/nv-embedqa-e5-v5` (the embedding model behind every stored vector)
  was retired by NVIDIA on 2026-08-25 (HTTP 410).
- The OpenAI key is valid but has no credits (`insufficient_quota`), and
  `LLM_PROVIDER=openai` in production.
- Every hosted NIM reranker we tried is retired or unavailable to the account,
  so the "real cross-encoder later" plan in ADR-0018 has no provider.

Probing the account (status codes only) left exactly one embedding model,
`nvidia/nemotron-3-embed-1b`, which only emits **2048** dimensions, and one chat
model, `openai/gpt-oss-20b`, which streams and reports token usage.

## Decision

1. **Embeddings:** `nvidia/nemotron-3-embed-1b`, stored as
   `document_chunks.embedding halfvec(2048)` with an HNSW `halfvec_cosine_ops`
   index. pgvector caps HNSW on `vector` at 2000 dims; `halfvec` allows 4000 and
   halves storage. Old vectors are cleared by the migration (they're
   meaningless without their model) and re-embedded via `scripts/reembed.py`.
   One factory (`build_embedding_provider`) serves both passages and queries.
   A dimension mismatch is a startup error, and a wrong-length vector is a
   permanent error. Vectors are never silently sliced.
2. **Chat / KG / agents:** `LLM_PROVIDER=nvidia`, `NVIDIA_MODEL=openai/gpt-oss-20b`.
3. **Reranking:** `LLMReranker` sends one temperature-0 call per search that
   scores the top fused candidates 0–10 as JSON. On any failure, results keep
   the fused order and `_rerank_succeeded=false` flags them. Its tokens are
   recorded as a `completion` usage event with `operation=rerank`.

## Consequences

- One extra LLM call per search/chat turn (latency + free-tier rate limits).
  `RERANKER_PROVIDER=identity` turns it off.
- The free NIM tier retires models with little notice; this happened twice in
  a quarter. Moving to a new embedding model is a migration plus a re-embed, and
  the startup dimension check makes a half-done switch fail loudly. OpenAI
  `text-embedding-3-large` with `dimensions=2048` fits the same column if paid
  credits are added.
- The reranker is a second LLM, not a trained cross-encoder; its quality
  should be measured with the retrieval eval suite (ADR-0028) before claiming
  gains.
