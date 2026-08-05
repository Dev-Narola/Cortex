/**
 * Dashboard loading state.
 */

import { Skeleton } from "@cortex/ui"

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton variant="text" className="h-9 w-1/3" />
        <Skeleton variant="text" className="h-4 w-1/2" />
      </div>
      <Skeleton variant="rect" className="h-64 w-full" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton variant="rect" className="h-32 w-full" />
        <Skeleton variant="rect" className="h-32 w-full" />
        <Skeleton variant="rect" className="h-32 w-full" />
      </div>
    </div>
  )
}
