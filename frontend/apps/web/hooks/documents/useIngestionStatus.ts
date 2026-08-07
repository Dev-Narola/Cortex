/**
 * useIngestionStatus — the React-side WebSocket hook.
 *
 * **F3 Part 4 (Tasks 36-37).** The hook is the
 * single mount point for the ingestion
 * WebSocket. It:
 *
 *   1. Constructs (or joins) the per-app
 *      `IngestionSocket` (so navigating between
 *      Documents and Dashboard doesn't open
 *      duplicate sockets — Task 46).
 *   2. Subscribes to typed events + applies them
 *      to the TanStack Query cache via
 *      `setQueryData` (per-document patch; Task 37).
 *   3. Exposes the connection state to the UI
 *      (Task 42).
 *   4. Cleans up the subscription on unmount
 *      (Task 46).
 *
 * **Module-level singleton.** The socket is
 * cached on the module so the first mount opens
 * the connection and every subsequent mount
 * reuses it. The hook tracks a refcount so the
 * last unmount disconnects.
 *
 * **Why a refcount instead of `useEffect` deps.**
 * The hook fires on every render; we want one
 * connection, not N. The refcount pattern gives
 * us "last consumer closes the door" semantics
 * with zero coordination across components.
 *
 * **Event → cache patch.** For each event, the
 * hook:
 *   - Patches the detail cache
 *     (`["documents", id]`) with the new status.
 *   - Patches the list cache
 *     (`["documents", params]`) by replacing the
 *     matching item in `items`.
 *   - The badge / table / drawer re-render via
 *     the same query subscribers — no extra
 *     wiring.
 *
 * **Authentication failure (Task 47).** If the
 * backend closes the socket with a 4xxx code
 * indicating an auth failure, the hook should
 * bail to the login flow. For Part 4 we log
 * + let the auto-reconnect keep trying; the F2
 * refresh path covers a token rotation.
 */

"use client"

import { useEffect, useRef, useState } from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"

import { useAuthStore } from "@/lib/auth/store"
import { shouldApplyStatus } from "@/lib/documents/status"
import {
  IngestionSocket,
  type IngestionStateListener,
} from "@/services/documents/ingestionSocket"
import type { Document } from "@/services/documents"
import type { IngestionEvent, IngestionStatusEvent } from "@/types/websocket"
import type { WebSocketState } from "@/lib/websocket/client"

export interface UseIngestionStatusResult {
  /** Current socket state. UI shows a subtle indicator. */
  connectionState: WebSocketState
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let sharedSocket: IngestionSocket | null = null
let refCount = 0

function ensureSocket(accessToken: string): IngestionSocket {
  if (!sharedSocket) {
    sharedSocket = new IngestionSocket({ accessToken })
  }
  return sharedSocket
}

// ---------------------------------------------------------------------------
// Cache patch helpers
// ---------------------------------------------------------------------------

const STATUS_EVENT_TYPES = new Set(["ingestion.status", "ingestion.detail"])

function patchDetailCache(
  qc: QueryClient,
  event: IngestionStatusEvent,
): void {
  const key = ["documents", event.document_id]
  const current = qc.getQueryData<Document>(key)
  if (!current) return
  if (!shouldApplyStatus(current.status, event.status)) return
  qc.setQueryData<Document>(key, {
    ...current,
    status: event.status,
  })
}

function patchListCache(
  qc: QueryClient,
  event: IngestionStatusEvent,
): void {
  // Match every cached list query. The list
  // query key is `["documents", params]` where
  // params is `{ limit, offset, status? }`. The
  // detail query is `["documents", id]` — we
  // skip those below.
  interface ListData {
    items: Document[]
    total: number
    limit: number
    offset: number
  }
  // `type: "all"` covers both active (subscribed)
  // and inactive (data-only) queries. A query
  // that has been seeded via `setQueryData` in
  // a test is "inactive" until something subscribes
  // — using `"all"` ensures the patch hits both.
  const queries = qc
    .getQueryCache()
    .findAll({ queryKey: ["documents"], type: "all" })
  for (const q of queries) {
    const k = q.queryKey
    // Skip the detail query (`["documents", id]`
    // with id being a non-object string).
    if (k.length === 2 && typeof k[1] === "string") continue

    const data = q.state.data as ListData | undefined
    if (!data || !Array.isArray(data.items)) continue
    const idx = data.items.findIndex((d: Document) => d.id === event.document_id)
    if (idx === -1) continue
    const item = data.items[idx]!
    if (!shouldApplyStatus(item.status, event.status)) continue
    const nextItems = data.items.slice()
    nextItems[idx] = { ...item, status: event.status }
    qc.setQueryData(q.queryKey, { ...data, items: nextItems })
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useIngestionStatus(): UseIngestionStatusResult {
  const qc = useQueryClient()
  const accessToken = useAuthStore((s) => s.accessToken)
  const [state, setState] = useState<WebSocketState>("idle")
  // Hold the unsubscribe fn on a ref so a
  // re-render doesn't double-subscribe.
  const unsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!accessToken) {
      // No session → no socket. (The page is
      // behind a protected route so this is
      // mostly belt-and-braces.)
      setState("closed")
      return
    }

    const socket = ensureSocket(accessToken)

    // Subscribe to connection-state transitions.
    const onState: IngestionStateListener = (next) => {
      setState(next)
    }
    const offState = socket.subscribeState(onState)
    // Sync the initial state in case the socket
    // is already open from an earlier mount.
    setState(socket.getState())

    // Subscribe to typed events.
    const onEvent = (event: IngestionEvent) => {
      if (!STATUS_EVENT_TYPES.has(event.type)) return
      if (event.type !== "ingestion.status") {
        // Future: detail events can be wired
        // here when the backend starts pushing
        // them. For Part 4 we no-op.
        return
      }
      patchDetailCache(qc, event)
      patchListCache(qc, event)
    }
    const offEvent = socket.subscribe(onEvent)
    unsubscribeRef.current = () => {
      offState()
      offEvent()
    }

    refCount += 1
    if (refCount === 1) {
      socket.connect()
    }

    return () => {
      // We always unsubscribe the listeners —
      // the socket is shared but the per-mount
      // handlers are not.
      const off = unsubscribeRef.current
      unsubscribeRef.current = null
      off?.()

      refCount = Math.max(0, refCount - 1)
      if (refCount === 0) {
        // Last consumer unmounted → tear down.
        socket.disconnect()
        sharedSocket = null
      }
    }
  }, [accessToken, qc])

  return { connectionState: state }
}
