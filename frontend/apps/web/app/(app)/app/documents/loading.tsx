/**
 * Documents route — loading shell.
 *
 * **F3 Part 2 (Task 11).** Renders inside the (app)
 * layout so the sidebar + topbar stay mounted while
 * the initial TanStack Query is in flight. Falls
 * back to the (app) group's spinner when this file
 * is omitted; we ship our own so we can keep the
 * card chrome stable (avoids a layout shift when
 * the table mounts).
 */

import { Card, CardContent, Spinner } from "@cortex/ui"

export default function DocumentsLoading() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded-md bg-muted" />
      </header>
      <Card>
        <CardContent
          className="flex min-h-[320px] items-center justify-center p-8"
          role="status"
          aria-live="polite"
        >
          <Spinner size="lg" />
        </CardContent>
      </Card>
    </div>
  )
}
