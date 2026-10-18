"use client"

import { Button, Card, CardContent } from "@cortex/ui"

export default function MarketingError({
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
    <div className="flex min-h-screen items-center justify-center p-6 bg-background text-foreground">
      <Card className="max-w-2xl w-full">
        <CardContent className="pt-6">
          <h2 className="font-display text-xl font-semibold text-destructive">
            Marketing Route Error
          </h2>
          <p className="mt-2 text-sm font-medium text-foreground">
            {error.name}: {error.message || "An unexpected error occurred."}
          </p>
          {error.digest && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">Digest: {error.digest}</p>
          )}
          {error.stack && (
            <pre className="mt-4 max-h-60 overflow-auto rounded bg-muted p-3 font-mono text-xs text-muted-foreground whitespace-pre-wrap">
              {error.stack}
            </pre>
          )}
          <Button onClick={reset} className="mt-4 w-full">
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
