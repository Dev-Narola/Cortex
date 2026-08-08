/**
 * ChatErrorState — the "couldn't load this
 * conversation" surface.
 *
 * **F4 Part 1 (Task 16).** Renders the F1
 * `ErrorState` with a Retry action. Used by the
 * `useConversation` hook when the fetch fails
 * (network, server, 404, etc.) and by the
 * `error.tsx` route boundary as a fallback.
 *
 * **Retry.** Calls the passed `onRetry` (the page
 * passes `refetch` from the TanStack Query result).
 * No page reload — the cache patcher handles the
 * re-render.
 */

import type { ReactNode } from "react"

import { Button, Card, CardContent, ErrorState, Icon } from "@cortex/ui"

export interface ChatErrorStateProps {
  onRetry?: () => void
  message?: string
}

export function ChatErrorState({
  onRetry,
  message,
}: ChatErrorStateProps): ReactNode {
  return (
    <Card>
      <CardContent className="py-12">
        <ErrorState
          title="We couldn't load this conversation"
          description={
            message ??
            "Something went wrong reaching Cortex. Try again — if the problem persists, refresh the page."
          }
          icon={<Icon name="TriangleAlert" className="h-6 w-6" />}
          retryLabel="Try again"
          onRetry={onRetry}
        />
      </CardContent>
    </Card>
  )
}

// Re-export the Button so the page-level error.tsx
// (which can't import the hook layer cleanly) can
// render a "Back to Chat" CTA.
export function ChatErrorBackButton({
  onClick,
}: {
  onClick: () => void
}): ReactNode {
  return (
    <Button onClick={onClick} variant="outline" size="sm">
      <Icon name="ArrowLeft" className="h-3.5 w-3.5" />
      <span>Back to Chat</span>
    </Button>
  )
}
