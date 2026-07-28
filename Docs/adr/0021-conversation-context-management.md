# ADR-0021: Conversation context management

**Status:** Accepted (V3)
**Date:** 2026-07-24

## Context

Modern LLMs have a fixed context window (8K–200K tokens
depending on the model). A long conversation can blow that
window if we just keep appending messages. The V3 spec
requires summarisation when the conversation exceeds the
model's usable context window.

## Decision

Cortex's ``ContextWindowManager`` (in
``src/conversation/application/context_manager.py``)
implements a **summary-replacement** strategy:

1. **Token budget:** the model's context window minus a
   reservation for system prompt, retrieved sources, and
   the upcoming assistant response.
2. **If the recent-message + summary tokens fit:** use
   them as-is.
3. **If they don't fit:** compact the oldest messages
   (everything except the most recent ``recent_window``,
   default 15) into a *new* summary. The new summary is
   built from the **old summary** plus the **newly
   compacted messages** — not the whole conversation.

### Why summary-replacement, not summary-rewrite

A naive implementation re-summarises the whole conversation
every time the budget overflows. The cost grows linearly
with conversation length. A summary-replacement strategy
is constant-time: the LLM only ever sees a fixed-size
``old_summary + new_turns`` payload, no matter how long the
conversation has been going.

### Why a recent window

The most recent messages are the ones that *carry
contextual meaning* — "turn left at the third light" only
makes sense if the assistant remembers which light. The
older messages can be summarised without losing much.

The default window is 15 messages (~3-4 turns of back-and-
forth). This is large enough to handle meaningful follow-up
questions, small enough that the budget still has plenty of
room for retrieved sources and the response.

### Token counting

We use ``tiktoken`` (the OpenAI BPE tokenizer) when
available, falling back to a 4-chars-per-token heuristic.
The exact count is not load-bearing; what matters is
that the math is **conservative** — under-counting tokens
is far worse than over-counting them.

### Failure policy

If the LLM call to summarise fails, ``ContextWindowManager``
keeps the *previous* summary and trims the recent window to
fit. The conversation continues with a slightly over-budget
context rather than failing the turn.

## Consequences

- The ``Conversation`` entity carries a ``summary`` field.
  Persisted on every compaction, loaded by the RAG service
  on every turn.
- The summarisation call goes through the standard
  ``LLMProvider`` port — no special-case LLM call, no
  different rate limit.
- The manager is **stateless** w.r.t. the conversation
  (no in-memory cache). Every call rebuilds from
  ``(summary, messages)``. This makes the manager safe to
  use across multiple worker processes.
- The summarisation is triggered by the **RAG service**
  inside the request path, not in a background job. The
  latency cost of the LLM call (~200–500ms) is on the
  critical path; we accept that for V3 because the rate of
  compaction is low (every few hundred messages).
