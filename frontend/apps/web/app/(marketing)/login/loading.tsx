"use client"

/**
 * Login loading state.
 *
 * **F2 Part 1 (Task 1).** Skeleton placeholder while
 * the page is being prepared (Next.js streams this
 * to the client).
 */

import { Skeleton } from "@cortex/ui"

export default function LoginLoading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <Skeleton variant="text" className="h-6 w-3/4" />
      <Skeleton variant="text" className="h-4 w-full" />
      <div className="space-y-2 pt-4">
        <Skeleton variant="rect" className="h-10 w-full" />
        <Skeleton variant="rect" className="h-10 w-full" />
        <Skeleton variant="rect" className="h-10 w-full" />
      </div>
    </div>
  )
}
