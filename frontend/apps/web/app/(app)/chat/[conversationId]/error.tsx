/**
 * Conversation route — error boundary.
 *
 * **F4 Part 1 (Task 16).** Last-resort catch for
 * render-time errors. The in-page `ChatErrorState`
 * (driven by `useConversation`) handles fetch
 * failures; this file handles exceptions that
 * bypass the query path.
 */

"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { Button, Card, CardContent, Icon } from "@cortex/ui"

export default function ConversationError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[chat/[conversationId]/error.tsx]", error)
  }, [error])

  const router = useRouter()

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Conversation
        </h1>
        <p className="text-sm text-muted-foreground">
          We hit a problem loading this conversation.
        </p>
      </header>
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
          >
            <Icon name="TriangleAlert" className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold tracking-tight">
              We couldn't load this conversation
            </h2>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              The error has been logged. Try again — if the problem persists, head back to the empty Chat.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={reset} variant="outline" size="sm">
              <Icon name="RefreshCw" className="h-3.5 w-3.5" />
              <span>Try again</span>
            </Button>
            <Button
              onClick={() => router.push("/chat" as never)}
              variant="default"
              size="sm"
            >
              <Icon name="MessageSquare" className="h-3.5 w-3.5" />
              <span>Back to Chat</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
