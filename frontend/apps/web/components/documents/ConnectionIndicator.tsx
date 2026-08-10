/**
 * ConnectionIndicator — a small pill that
 * surfaces the ingestion WebSocket state.
 *
 * **F3 Part 4 (Task 42).** Per the spec, the
 * UI must show a non-intrusive indicator of the
 * WebSocket state. We render:
 *
 *   - `open`       → small green dot + "Live"
 *   - `connecting` → small spinning dot + "Connecting…"
 *   - `closed`     → small grey dot + "Offline"
 *   - `idle`       → hidden (the page just mounted;
 *                              connecting will fire next)
 *
 * **No modals, no toasts.** The user can keep
 * working with a stale table while the socket
 * reconnects.
 */

import type { ReactNode } from "react"

import { cn } from "@cortex/ui"

import type { WebSocketState } from "@/lib/websocket/client"

export interface ConnectionIndicatorProps {
  state: WebSocketState
  className?: string
}

const COPY: Record<WebSocketState, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  open: "Live",
  closing: "Closing…",
  closed: "Offline",
}

export function ConnectionIndicator({
  state,
  className,
}: ConnectionIndicatorProps): ReactNode | null {
  if (state === "idle") return null
  // Render as a <span> (not <div>) so the
  // indicator can live inside a <p> without
  // triggering a React hydration warning
  // ("<div> cannot be a descendant of <p>").
  // The toolbar's description slot uses a
  // <p> wrapper; an inline indicator is the
  // right shape for that context.
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 align-middle text-xs text-muted-foreground",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          state === "open" && "bg-success",
          state === "connecting" &&
            "bg-warning animate-pulse",
          state === "closed" && "bg-muted-foreground",
          state === "closing" && "bg-warning",
        )}
      />
      <span>{COPY[state]}</span>
    </span>
  )
}
