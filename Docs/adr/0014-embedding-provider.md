# ADR-0014: Embedding provider

**Status:** Accepted (V3)
**Date:** 2026-07-24

## Context

The Cortex RAG stack needs an embedding model. The candidate
providers (V3 evaluation):

| Provider | Strengths | Weaknesses |
|----------|-----------|------------|
| OpenAI `text-embedding-3-small` | Cheap, well-documented, HNSW-friendly 1536-dim | Vendor lock-in, requires API key |
| Voyage AI | High quality, focused on RAG | Newer, more expensive |
| Cohere `embed-english-v3.0` | Strong enterprise tooling | Pricing model |
| Anthropic | No embedding endpoint at all | Not applicable |
| Local cross-encoder | Zero network cost, full control | Hardware cost, no upgrades |

## Decision

Use **OpenAI `text-embedding-3-small`** as the V3 default.

### Why

1. The V3 architecture explicitly assumes pgvector + 1536 dimensions.
   `text-embedding-3-small` produces exactly that, no migration work.
2. The same provider can serve both document indexing and query
   embedding, which is the *critical* rule for vector search (different
   models = different vector spaces = silently broken retrieval).
3. The provider is hidden behind the ``EmbeddingProvider`` port so
   swapping to Voyage / Cohere / a local model is a one-line
   dependency change in
   ``src.ingestion.workers.dependencies.get_embedding_provider``.

### Why not a local model

A local sentence-transformers model would avoid the network call but
would require hosting a GPU/ML runtime alongside the FastAPI +
worker pods, which is a non-trivial operational cost at this stage.
The V3 spec explicitly says hosted LLM APIs are the product's
default; we follow that.

## Consequences

- **Operational:** every tenant's ingestion is dependent on the
  OpenAI API staying up. We mitigate this with
  ``TransientEmbeddingError`` / ``PermanentEmbeddingError``
  classification so the Arq worker can retry transient failures
  (timeouts, 5xx, rate limits) and give up immediately on
  permanent ones (auth, bad model, bad input).
- **Cost:** ~$0.02 per 1M tokens (text-embedding-3-small). At
  10K docs × 1K tokens each = $0.20 to embed the whole tenant.
- **Caching:** identical content across documents would otherwise
  hit the API repeatedly. The OpenAI provider hashes each input
  with SHA-256 and caches the result in Redis (TTL 7 days),
  keyed by ``emb:{model}:{hash}``.
- **Dimension drift:** the OpenAI provider enforces that
  ``settings.EMBEDDING_DIMENSIONS`` matches the configured model.
  A mismatch is a permanent error so we never write wrong-shaped
  vectors to the database.
- **Swap cost:** when the next generation of OpenAI embeddings
  ships, the migration is:
  1. add a new column (``embedding_v2``) or
  2. set ``EMBEDDING_MODEL`` to the new model and run a re-embed job
     against ``document_chunks`` that updates rows in place.
  The metadata columns (``embedding_model``, ``embedding_version``)
  are exactly what makes that re-embed job possible.
