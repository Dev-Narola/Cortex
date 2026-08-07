/**
 * DocumentErrorState — the documents error surface.
 *
 * **F3 Part 2 (Task 19).** Categorises the failure
 * into one of:
 *   - `network`   — fetch threw (no response)
 *   - `server`    — 5xx
 *   - `permission` — 401/403
 *   - `unknown`   — anything else
 *
 * Each variant has its own copy + retry path. Retry
 * calls `refetch` from the TanStack Query result
 * (so the table re-uses the cached query, no
 * window reload).
 *
 * **Why a category instead of a raw error message.**
 * A raw "Failed to load: 500" is noise; "The server
 * hit an error. Try again in a moment" tells the
 * user what to do.
 */

"use client"

import type { ReactNode } from "react"

import { Card, CardContent, ErrorState, Icon } from "@cortex/ui"

import { toFrontendError, type FrontendError } from "@/lib/http/errors"

export interface DocumentErrorStateProps {
  /** The raw error from TanStack Query. */
  error: unknown
  /** TanStack Query's `refetch`. */
  onRetry: () => void
  /** True while the retry is in flight. */
  isRetrying?: boolean
}

function categorise(error: unknown): {
  title: string
  description: string
  icon: "Wifi" | "ServerCrash" | "ShieldAlert" | "TriangleAlert"
} {
  const fe = toFrontendError(error) as FrontendError
  switch (fe.kind) {
    case "network":
      return {
        title: "Can't reach Cortex",
        description:
          "Your network connection dropped. Check the cable, then try again.",
        icon: "Wifi",
      }
    case "server":
      return {
        title: "The server hit an error",
        description:
          "Cortex returned a 5xx response. The team has been paged; try again in a moment.",
        icon: "ServerCrash",
      }
    case "unauthorized":
    case "forbidden":
      return {
        title: "You don't have access",
        description:
          "Your session may have expired. Try signing in again, or contact your workspace admin.",
        icon: "ShieldAlert",
      }
    default:
      return {
        title: "Something went wrong",
        description:
          "We couldn't load your documents. The team has been notified — please try again.",
        icon: "TriangleAlert",
      }
  }
}

export function DocumentErrorState({
  error,
  onRetry,
  isRetrying = false,
}: DocumentErrorStateProps): ReactNode {
  const { title, description, icon } = categorise(error)

  return (
    <Card>
      <CardContent className="py-12">
        <ErrorState
          title={title}
          description={description}
          icon={<Icon name={icon} className="h-6 w-6" />}
          retryLabel={isRetrying ? "Retrying…" : "Try again"}
          onRetry={onRetry}
        />
      </CardContent>
    </Card>
  )
}
