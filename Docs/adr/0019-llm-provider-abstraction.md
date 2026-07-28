# ADR-0019: LLM provider abstraction

**Status:** Accepted (V3)
**Date:** 2026-07-24

## Context

Cortex calls a hosted LLM to (a) answer user questions and
(b) summarise long conversation histories. The LLM is
external: swapping provider (OpenAI → Anthropic → a local
model) must be a one-line change, not a refactor.

## Decision

The application layer depends on the ``LLMProvider`` port
defined in ``src/conversation/domain/ports.py``. The port
exposes two methods:

* ``async complete(messages, model, temperature) -> str``
* ``async stream(messages, model, temperature) -> AsyncIterator[str]``

A concrete adapter (``OpenAIProvider``) lives in
``src/conversation/infrastructure/llm/openai.py`` and is
selected by ``settings.LLM_PROVIDER``.

### Why a port, not a direct dependency

If the application code imported ``openai.AsyncOpenAI``
directly, swapping providers would require touching every
service that talks to the LLM. The port-adapter split
(hexagonal architecture) lets us:

* Swap providers without touching the application code.
* Write deterministic unit tests with a fake
  ``LLMProvider`` (see ``test_rag_service.py``).
* Vendor the LLM client in *one* place — easier to audit
  (security review, cost tracking, retry logic).

### Streaming is first-class

``stream()`` is an ``AsyncGenerator`` of strings, *not* a
single-response call. The WebSocket layer consumes the
generator token-by-token and emits a ``token`` envelope per
chunk. A future Anthropic adapter implements ``stream()``
the same way; the WebSocket code is provider-agnostic.

### Why not just async functions

A module-level ``async def chat(...)`` would technically
work, but it would couple the application code to the
provider SDK. The Protocol-based port gives us the same
ergonomics with the swap-out guarantee.

## Consequences

- The application code never imports ``openai`` (or any
  provider SDK). Search the codebase — the only place
  ``openai`` shows up is inside
  ``src/conversation/infrastructure/llm/openai.py``.
- Adding a new provider (Anthropic, Cohere, a local vLLM
  server) is a new file in
  ``src/conversation/infrastructure/llm/`` and a branch in
  ``LLMProvider`` selection.
- The port is intentionally minimal (no ``embeddings``,
  no ``image_generation``) — V3 only uses text-in / text-out.
  Other ports can be added as V6/V7/V8 need them.
