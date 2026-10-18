"use client"

import { Button, Card, CardContent } from "@cortex/ui"
/**
 * Global error boundary — every route group inherits this.
 * Logs the error to the console and shows a recovery link.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  if (error.digest?.startsWith("NEXT_REDIRECT")) {
    throw error
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-md">
        <CardContent className="pt-6">
          <h2 className="font-display text-xl font-semibold">Something went wrong</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {error.message || "An unexpected error occurred."}
          </p>
          {error.digest && (
            <p className="mt-2 font-mono text-xs text-muted-foreground">{error.digest}</p>
          )}
          <Button onClick={reset} className="mt-4">
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
