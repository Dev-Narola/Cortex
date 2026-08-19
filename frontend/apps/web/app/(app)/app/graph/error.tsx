/**
 * Knowledge Graph — error boundary.
 *
 * **F6 Part 1.** Last-resort catch for render-
 * time errors that bypass the explorer's own
 * state. The pattern matches the rest of the
 * F3 error surfaces: log + render a clear
 * explanation + a Try again button.
 *
 * **Why this exists even with a robust
 * explorer.** R3F's WebGL context can fail
 * to initialise on some devices (no GPU, very
 * old drivers, the user has WebGL disabled).
 * The error boundary is the user's escape
 * hatch when the 3D path is unrecoverable; a
 * future F9 part adds a 2D force-directed
 * fallback that activates from inside this
 * boundary.
 */

"use client"

import { useEffect } from "react"

import { Button, Card, CardContent, Icon } from "@cortex/ui"

export default function GraphError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // The Next.js dev overlay picks this up;
    // we keep the console log for production
    // runs.
    console.error("[graph/error.tsx]", error)
  }, [error])

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Knowledge Graph</h1>
        <p className="text-sm text-muted-foreground">
          The 3D scene failed to render. Your other Cortex screens are still available.
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
              We couldn&apos;t render the graph
            </h2>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              This usually means the WebGL context couldn&apos;t initialise (older device, disabled
              hardware acceleration, or a browser policy). The error has been logged — try again, or
              open another screen while we look into it.
            </p>
          </div>
          <Button onClick={reset} variant="outline" size="sm">
            <Icon name="RefreshCw" className="h-3.5 w-3.5" />
            <span>Try again</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
