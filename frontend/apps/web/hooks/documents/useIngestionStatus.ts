/**
 * useIngestionStatus — the React-side WebSocket hook.
 *
 * **F3 Part 4 (Tasks 36-37) + V11.5 polling fallback.**
 * The hook is the single mount point for ingestion
 * status updates. It:
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
 *   5. **V11.5 polling fallback.** When the WebSocket
 *      is down (the backend doesn't yet ship a
 *      ``/ws/ingestion`` endpoint, or the connection
 *      has been refused with 403), the hook keeps the
 *      document list fresh by invalidating the list
 *      query every 5 seconds while any in-flight
 *      documents are present. The transport state
 *      transitions to ``"polling"`` so the UI can
 *      show a "Polling…" pill. Polling stops when
 *      all in-flight documents reach a terminal
 *      state (indexed / failed) — at that point the
 *      state falls back to ``"closed"``.
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
import { isInFlight, shouldApplyStatus } from "@/lib/documents/status"
import {
  IngestionSocket,
  type IngestionStateListener,
} from "@/services/documents/ingestionSocket"
import type { Document } from "@/services/documents"
import type { IngestionEvent, IngestionStatusEvent } from "@/types/websocket"
import type { WebSocketState } from "@/lib/websocket/client"

export interface UseIngestionStatusResult {
  /**
   * Current transport state. ``"open"`` / ``"connecting"``
   * mean the live WebSocket; ``"polling"`` means the WS
   * is down and the hook is keeping the cache fresh via
   * list-query refetch; ``"closed"`` is the resting state
   * with no in-flight documents to watch.
   */
  connectionState: WebSocketState
}

/**
 * V11.5 — poll cadence (ms). The list query is
 * invalidated on this interval while polling is
 * active. 5s matches the backend's status transition
 * cadence for an average-sized document; tight enough
 * to feel live, loose enough to not pummel the API.
 *
 * **Exported for tests.** The cadence test wants to
 * pin the exact interval ``setInterval`` is called
 * with without having to actually wait 5s. The
 * runtime value is the same; only the visibility
 * changes.
 */
export const INGESTION_POLL_INTERVAL_MS = 5_000

/**
 * Count in-flight documents across every cached
 * list query. In-flight = ``pending | parsing |
 * chunking | embedding`` (anything that hasn't
 * reached ``indexed`` or ``failed``).
 *
 * The list cache is the natural source of truth:
 * the Documents table only renders rows the user
 * has loaded, and the status field is the same
 * one the WebSocket patcher writes to. We don't
 * have to hit the network to know whether
 * polling is needed.
 */
function countInFlightDocs(qc: QueryClient): number {
  let count = 0
  const queries = qc
    .getQueryCache()
    .findAll({ queryKey: ["documents"], type: "all" })
  for (const q of queries) {
    const k = q.queryKey
    // Skip detail queries (`["documents", id]`
    // with id being a non-object string). The
    // list query key shape is `["documents",
    // params]` where params is an object.
    if (k.length === 2 && typeof k[1] === "string") continue
    const data = q.state.data as
      | { items?: Document[] }
      | undefined
    if (!data || !Array.isArray(data.items)) continue
    for (const doc of data.items) {
      if (isInFlight(doc.status)) count += 1
    }
  }
  return count
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
  // ``wsState`` is the raw state reported by the
  // WebSocket client. The outward-facing
  // ``connectionState`` (computed below) folds in
  // the V11.5 polling fallback on top of this.
  const [wsState, setWsState] = useState<WebSocketState>("idle")
  // Hold the unsubscribe fn on a ref so a
  // re-render doesn't double-subscribe.
  const unsubscribeRef = useRef<(() => void) | null>(null)
  // V11.5 — reactive count of in-flight documents
  // across every cached list query. Updated by
  // the cache-subscription effect below; read by
  // the polling effect to decide whether to keep
  // the list query warm.
  const [inFlightCount, setInFlightCount] = useState(0)
  // Interval handle for the polling fallback.
  // Stored in a ref so a re-render doesn't lose it.
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // -----------------------------------------------------------------
  // Effect 1 — WebSocket lifecycle
  // -----------------------------------------------------------------
  // Identical to the F3 Part 4 behaviour. The
  // polling effect below is independent of this
  // one and runs in parallel.
  useEffect(() => {
    if (!accessToken) {
      // No session → no socket. (The page is
      // behind a protected route so this is
      // mostly belt-and-braces.)
      setWsState("closed")
      return
    }

    const socket = ensureSocket(accessToken)

    // Subscribe to connection-state transitions.
    const onState: IngestionStateListener = (next) => {
      setWsState(next)
    }
    const offState = socket.subscribeState(onState)
    // Sync the initial state in case the socket
    // is already open from an earlier mount.
    setWsState(socket.getState())

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

  // -----------------------------------------------------------------
  // Effect 2 — V11.5 cache subscription (in-flight count)
  // -----------------------------------------------------------------
  // Subscribes to the query cache so the
  // ``inFlightCount`` state stays in sync with
  // whatever the documents list currently shows.
  // The polling effect (Effect 3) reads this and
  // starts/stops the interval accordingly. Without
  // this subscription the count would only update
  // on the next render triggered by something
  // else, and polling would never start in
  // response to an upload.
  useEffect(() => {
    if (!accessToken) {
      setInFlightCount(0)
      return
    }
    // Seed the initial value so the first render
    // after mount already has the right count
    // (matters when the list was prefetched by
    // the route prefetcher).
    setInFlightCount(countInFlightDocs(qc))
    const unsubscribe = qc.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" ||
        event.type === "added" ||
        event.type === "removed"
      ) {
        setInFlightCount(countInFlightDocs(qc))
      }
    })
    return unsubscribe
  }, [qc, accessToken])

  // -----------------------------------------------------------------
  // Effect 3 — V11.5 polling fallback
  // -----------------------------------------------------------------
  // Runs whenever the WS state OR the in-flight
  // count changes. While the WebSocket is open
  // (or actively connecting) the WS is the
  // source of truth and the interval is stopped.
  // When the WS is down AND there are in-flight
  // documents, the list query is invalidated on
  // a 5s cadence so the UI keeps moving toward
  // the terminal state. Polling stops as soon as
  // every in-flight document reaches ``indexed``
  // or ``failed``; the connection state then
  // falls back to whatever the WS reported
  // (``closed`` / ``idle``).
  useEffect(() => {
    const clearPolling = (): void => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
    if (!accessToken) {
      clearPolling()
      return
    }
    // WS is the primary transport — don't fight it.
    if (
      wsState === "open" ||
      wsState === "connecting" ||
      wsState === "closing"
    ) {
      clearPolling()
      return
    }
    // Nothing in flight → no point polling.
    if (inFlightCount === 0) {
      clearPolling()
      return
    }
    // Already running.
    if (pollIntervalRef.current) return

    // Kick off an immediate refetch so the user
    // doesn't wait 5s for the first poll to land,
    // then schedule the recurring interval.
    void qc.invalidateQueries({ queryKey: ["documents"] })
    pollIntervalRef.current = setInterval(() => {
      void qc.invalidateQueries({ queryKey: ["documents"] })
    }, INGESTION_POLL_INTERVAL_MS)
    return clearPolling
  }, [wsState, inFlightCount, accessToken, qc])

  // -----------------------------------------------------------------
  // Effective state — folds WS state + polling
  // -----------------------------------------------------------------
  // The WS state wins while it's actively open /
  // connecting / closing. While the WS is down
  // AND we're polling, surface the new
  // ``"polling"`` state so the UI can render a
  // distinct label. Otherwise fall back to the
  // raw WS state (typically ``closed`` or
  // ``idle``).
  const connectionState: WebSocketState =
    wsState === "open" ||
    wsState === "connecting" ||
    wsState === "closing"
      ? wsState
      : inFlightCount > 0 &&
          (wsState === "closed" || wsState === "idle")
        ? "polling"
        : wsState

  return { connectionState }
}
