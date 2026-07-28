# ADR-0020: WebSocket streaming for chat

**Status:** Accepted (V3)
**Date:** 2026-07-24

## Context

The RAG answer can take 5–30 seconds to generate (the LLM
emits tokens one at a time, and Cortex prepends a search +
rerank + prompt build before the first token). A user
sitting in front of a UI that doesn't update for 30 seconds
will think the app is broken.

The options:

1. **Server-Sent Events (SSE):** one-way, HTTP-based, simple.
2. **WebSocket:** bidirectional, full-duplex, slightly more
   plumbing.
3. **Long polling:** simple, but holds a request open for
   the whole generation.

## Decision

Cortex uses **WebSocket** for chat, mounted at
``/ws/conversations/{conversation_id}``.

### Why WebSocket over SSE

* **Bidirectional.** A future V6 agent layer will send
  ``tool_call`` / ``interrupt`` messages from the client
  mid-stream. SSE is one-way; we'd have to layer another
  channel for that.
* **Single persistent connection.** The browser doesn't
  have to reconnect per message; auth runs once at the start
  of the session.
* **Native in every browser.** No polyfill, no
  ``EventSource`` quirks.

### Why WebSocket over long polling

Long polling holds an HTTP request open for the duration of
the generation. The server can't push updates without
running a poll on a separate channel. WebSocket is the
right tool for "server pushes many small messages over time."

### The protocol

A small, additive protocol defined in
``src/conversation/interface/websocket/handlers.py``:

```
client →  {"type": "message", "content": "..."}
server →  {"type": "message_start", "message_id": "..."}
server →  {"type": "token", "content": "Retry"}
server →  {"type": "token", "content": " handling"}
server →  {"type": "citation", "citation": {...}}
server →  {"type": "message_complete", "message_id": "..."}
```

Clients must ignore unknown envelope types so the protocol
can grow additively.

### Auth

WebSockets can't easily set HTTP headers in the browser API,
so the route accepts the JWT via either the standard
``Authorization: Bearer ...`` header or a ``?token=...``
query parameter. Both are validated through the same
``_resolve_jwt_user`` path so neither is weaker than the
other.

### Tenant isolation

The route refuses the connection (close code 4403) when the
conversation does not belong to the authenticated user's
tenant, or when the user is not the conversation's owner.
There is no "share a conversation" path in V3.

## Consequences

- The WebSocket route is mounted directly on the app
  (not under ``/api/v1``) so clients can hit it with
  ``ws://host/ws/conversations/{id}`` without an extra path
  prefix.
- Heartbeats (RFC 6455 ping frames) are emitted by
  Arq/FastAPI's WebSocket implementation at the OS level;
  no application-level keep-alive needed.
- A failed LLM generation produces an ``error`` envelope
  rather than closing the connection. The client can retry
  on the same connection.
- The route is the only consumer of the ``ws_router``; the
  REST API does not need to know it exists.
