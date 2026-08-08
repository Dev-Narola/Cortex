/**
 * Chat route — loading state.
 *
 * **F4 Part 1 (Task 15).** Renders inside the
 * (app) layout so the sidebar + topbar stay
 * mounted while the conversation is fetched.
 * Uses the F1 `Skeleton` primitive (no full-page
 * spinner).
 */

import { Card, Skeleton } from "@cortex/ui"

export default function ChatLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header skeleton */}
      <div className="flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 sm:px-6">
        <Skeleton variant="text" className="h-5 w-48" />
        <Skeleton variant="rect" className="h-8 w-20 rounded-md" />
      </div>

      {/* Message list skeleton — three placeholder
          turns (user / assistant / user) so the
          loaded state is the same height as the
          real one. */}
      <div className="flex flex-1 flex-col gap-4 overflow-hidden px-4 py-6 sm:px-6">
        <div className="ml-auto">
          <Skeleton variant="rect" className="h-12 w-64 rounded-2xl" />
        </div>
        <div className="mr-auto">
          <Skeleton variant="rect" className="h-16 w-80 rounded-2xl" />
        </div>
        <div className="ml-auto">
          <Skeleton variant="rect" className="h-10 w-56 rounded-2xl" />
        </div>
      </div>

      {/* Input skeleton */}
      <div className="border-t border-border bg-card/50 px-4 py-3 sm:px-6">
        <Card>
          <Skeleton variant="rect" className="h-10 w-full rounded-md" />
        </Card>
      </div>
    </div>
  )
}
