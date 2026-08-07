/**
 * Documents route — error boundary.
 *
 * **F3 Part 2 (Task 11).** Last-resort catch for
 * render-time errors that bypass TanStack Query
 * (e.g. an exception thrown while reading
 * `useDocuments` outside the React Query error
 * path). The in-page error state (network / 5xx /
 * permission) is handled by `DocumentErrorState`
 * + the `refetch` button.
 *
 * **Reset.** Calls `reset()` to re-render the page
 * segment — cheaper than a full reload, matches
 * the rest of the F3 error surfaces.
 */

"use client"

import { useEffect } from "react"

import { Button, Card, CardContent, Icon } from "@cortex/ui"

export default function DocumentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // The Next.js dev overlay picks this up; we keep
    // the console log for production runs.
    console.error("[documents/error.tsx]", error)
  }, [error])

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground">
          We hit a problem rendering the page.
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
              Something went wrong
            </h2>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              The error has been logged. Try again — if the problem persists, refresh the page.
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
