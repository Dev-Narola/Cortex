# Real-Time

V9 Frontend — companion to `apps/web/lib/socket/`.

The web app uses **native WebSocket** (not Socket.IO). The
backend is plain FastAPI WebSocket; Socket.IO would be dead
weight negotiating a handshake the server doesn't speak.

## Surface

| Path | Direction | Purpose |
| --- | --- | --- |
| `/ws/conversations/{id}` | Server → client | Streaming chat tokens |
| `/ws/documents/{id}/status` | Server → client | Ingestion state changes (pending → parsing → embedded) |

The `useSocket` hook (`lib/socket/use-socket.ts`) is the single
entry point. It:
* Opens the socket when the path changes.
* Reconnects with exponential backoff (200ms → 30s, capped at 20 attempts).
* Surfaces `status` (`idle` / `connecting` / `open` / `closed` / `error`)
  to the caller.
* Hides the token in the `?token=` query param so the server
  can authenticate the connection.

## Auth

The auth token is appended as `?token=...` on connect; the
server's WebSocket endpoint reads it from the query string
(the standard FastAPI pattern — headers aren't easy to set
from a browser WebSocket client).

A 401 from the WebSocket is treated as a "reconnect with
fresh token" signal — the hook re-reads the auth store, gets
the (possibly refreshed) token, and reconnects.

## Token buffering

Streaming tokens arrive faster than 60fps. The
`useRafStream` hook (`lib/streaming/use-raf-stream.ts`)
coalesces them into a single per-frame state update via
`requestAnimationFrame`. Honours `prefers-reduced-motion` by
falling back to `setTimeout(0)`.

## Reconnect UX

* **1st attempt:** silent (within 200ms of the original close).
* **2nd–5th attempts:** silent.
* **6th attempt onward:** the hook surfaces a small "Reconnecting…"
  indicator. The user can keep typing / scrolling.
* **20th attempt:** the hook gives up. A toast suggests a
  page refresh.

This matches the same silent-first pattern the backend's
`/auth/refresh` uses (per V9 Part 3 Task 28 — auth UX).

## Reconnection during SSR

The hook is `useEffect`-gated, so it only runs on the client.
SSR'd pages don't open sockets.

## Latency budget

* Server → first token: < 100ms (LLM TTFB).
* Server → last token: bounded by the response length, not the
  protocol.
* Client → render: < 16ms (one frame) thanks to rAF batching.
* Reconnect time: < 1s for the first 3 attempts, < 30s for the
  worst case.
