/**
 * Ingestion WebSocket service — specializes the
 * generic `WebSocketClient` for document ingestion.
 *
 * **F3 Part 4 (Task 33).** The service owns:
 *   - The connection URL (built from
 *     `NEXT_PUBLIC_WS_URL` + the access token).
 *   - The connection lifecycle (open / close /
 *     reconnect).
 *   - The parser (raw frame → typed event).
 *   - The per-document status map (the React hook
 *     subscribes to changes via `subscribe`).
 *
 * **Auth (Task 47).** The browser `WebSocket`
 * API can't set custom headers. The standard
 * pattern is to pass the access token in a
 * query param. The V4 ingestion endpoint
 * (when it lands server-side) is expected to
 * accept `?token=…`; the client already passes
 * the same token the api-client sends on REST
 * calls, so the backend auth reuses the same
 * verification path.
 *
 * **One instance per app.** Constructed lazily
 * by `useIngestionStatus`. The lifecycle is
 * driven by the React component that owns the
 * hook — when the Documents page unmounts, the
 * hook disconnects the service.
 *
 * **No polling.** This file owns a single
 * WebSocket connection; reconnection is the
 * exponential-backoff loop in the client.
 */

import { publicEnv } from "@cortex/config"

import { shouldApplyStatus } from "@/lib/documents/status"
import {
  WebSocketClient,
  type WebSocketState,
} from "@/lib/websocket/client"
import { parseIngestionEvent } from "@/lib/websocket/parseEvent"
import type { IngestionEvent } from "@/types/websocket"

import type { DocumentStatus } from "@/lib/documents/status"

export type IngestionListener = (event: IngestionEvent) => void
export type IngestionStateListener = (state: WebSocketState) => void

export interface IngestionSocketOptions {
  /** Access token used to authenticate the WS handshake. */
  accessToken: string
}

/**
 * Build the WS URL for the ingestion channel.
 * Exported so tests can pin the contract.
 */
export function buildIngestionSocketUrl(accessToken: string): string {
  const base = publicEnv.NEXT_PUBLIC_WS_URL.replace(/\/+$/, "")
  // The token is passed via query string
  // because browsers can't set custom headers
  // on `new WebSocket()`. The backend auth is
  // expected to read this exact parameter.
  const url = new URL(`${base}/ws/ingestion`)
  url.searchParams.set("token", accessToken)
  return url.toString()
}

export class IngestionSocket {
  private client: WebSocketClient
  private listeners = new Set<IngestionListener>()
  private stateListeners = new Set<IngestionStateListener>()
  private statuses = new Map<string, DocumentStatus>()

  constructor(options: IngestionSocketOptions) {
    this.client = new WebSocketClient({
      url: buildIngestionSocketUrl(options.accessToken),
      onStateChange: (state) => {
        for (const fn of this.stateListeners) fn(state)
      },
      onMessage: (data) => {
        const event = parseIngestionEvent(data)
        if (!event) {
          // Malformed event: log + ignore (Task 48).
          // We don't throw — the spec is explicit
          // that the Documents page must not crash
          // on a bad frame.
          if (typeof console !== "undefined") {
            console.warn(
              "[ingestionSocket] dropped malformed event:",
              data,
            )
          }
          return
        }
        this.applyEvent(event)
      },
      onError: (event) => {
        if (typeof console !== "undefined") {
          console.warn("[ingestionSocket] socket error", event)
        }
      },
    })
  }

  // -----------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------

  connect(): void {
    this.client.connect()
  }

  disconnect(): void {
    this.client.disconnect()
  }

  getState(): WebSocketState {
    return this.client.getState()
  }

  /**
   * Subscribe to typed ingestion events. Returns
   * an unsubscribe function — the React hook
   * uses this in a `useEffect` cleanup.
   */
  subscribe(listener: IngestionListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Subscribe to connection-state transitions.
   * The UI uses this for the small "Reconnecting…"
   * indicator (per Task 42).
   */
  subscribeState(listener: IngestionStateListener): () => void {
    this.stateListeners.add(listener)
    return () => {
      this.stateListeners.delete(listener)
    }
  }

  /**
   * Current per-document status (in-memory).
   * Returns `null` if the document hasn't been
   * seen yet. The hook layer prefers the
   * TanStack Query cache as the source of truth
   * (Task 37) — this is a fallback / debugging
   * surface.
   */
  getStatus(documentId: string): DocumentStatus | null {
    return this.statuses.get(documentId) ?? null
  }

  /**
   * Snapshot of the full status map. The hook
   * can use this on mount to seed the cache
   * before the first WS event arrives (in case
   * a status is "in progress" on connect).
   */
  getAllStatuses(): Record<string, DocumentStatus> {
    return Object.fromEntries(this.statuses)
  }

  // -----------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------

  private applyEvent(event: IngestionEvent): void {
    // Only `ingestion.status` events mutate the
    // per-document status map. `ingestion.detail`
    // events are passed through to listeners
    // (the cache patcher can decide what to do
    // with chunk counts etc.).
    if (event.type === "ingestion.status") {
      const current = this.statuses.get(event.document_id)
      if (
        current === undefined ||
        shouldApplyStatus(current, event.status)
      ) {
        this.statuses.set(event.document_id, event.status)
      } else {
        // Stale event — drop silently (Task 44).
        return
      }
    }
    for (const fn of this.listeners) fn(event)
  }
}
