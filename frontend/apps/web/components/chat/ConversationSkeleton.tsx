/**
 * ConversationSkeleton — the "loading" state
 * for a conversation.
 *
 * **F4 Part 4 (Task 91).** Renders a layout-stable
 * placeholder that resembles the actual
 * conversation: a user bubble on the right, an
 * assistant bubble on the left with a slightly
 * longer content skeleton, and a citation rail
 * skeleton under the assistant.
 *
 * **Why not a spinner.** The spec is explicit:
 *
 *   > Do not use a generic full-screen spinner.
 *   > This keeps the layout stable while the
 *   > conversation loads.
 *
 * The skeleton reuses the same widths as the
 * real bubbles so the surrounding layout
 * (header, input) doesn't jump when the data
 * arrives.
 *
 * **Animation.** The F1 `Skeleton` primitive
 * uses `animate-pulse`. The project's
 * `prefers-reduced-motion` query (in
 * `packages/ui/globals.css`) suppresses the
 * animation for users who opt out — Task 106.
 *
 * **Reuse.** The same component is also used
 * by the chat route's `loading.tsx` and by
 * `MessageList` when the conversation is in
 * a "stale" refetch state.
 */

import type { ReactNode } from "react"

import { Skeleton } from "@cortex/ui"

export interface ConversationSkeletonProps {
  /** Number of user / assistant pairs to fake.
   *  Default 3 — the typical "first impression"
   *  of a returning conversation. */
  pairCount?: number
  className?: string
}

export function ConversationSkeleton({
  pairCount = 3,
  className,
}: ConversationSkeletonProps): ReactNode {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading conversation"
      data-conversation-skeleton
      className={
        "flex flex-1 flex-col gap-4 overflow-hidden px-4 py-6 sm:px-6 " +
        (className ?? "")
      }
    >
      {Array.from({ length: pairCount }).map((_, i) => (
        <div
          key={i}
          className="flex w-full flex-col gap-3"
          data-skeleton-pair
        >
          {/* User bubble on the right. */}
          <div className="ml-auto flex w-fit max-w-2xl flex-col gap-1.5">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-9 w-48 rounded-2xl" />
          </div>
          {/* Assistant bubble on the left. */}
          <div className="mr-auto flex w-fit max-w-2xl flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-56" />
            {/* Citation rail placeholder. */}
            <div className="mt-1 flex gap-1.5">
              <Skeleton className="h-4 w-6 rounded-full" />
              <Skeleton className="h-4 w-6 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
