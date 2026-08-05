"use client"

/**
 * Register loading state.
 */

import { Skeleton } from "@cortex/ui"

export default function RegisterLoading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <Skeleton variant="text" className="h-6 w-3/4" />
      <Skeleton variant="text" className="h-4 w-full" />
      <div className="space-y-2 pt-4">
        <Skeleton variant="rect" className="h-10 w-full" />
        <Skeleton variant="rect" className="h-10 w-full" />
        <Skeleton variant="rect" className="h-10 w-full" />
        <Skeleton variant="rect" className="h-10 w-full" />
      </div>
    </div>
  )
}
