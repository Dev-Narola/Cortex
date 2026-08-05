/**
 * Login error boundary.
 *
 * **F2 Part 1 (Task 1).** Catches render-time errors in
 * the login route. Reset sends the user back to /login
 * to retry.
 */

"use client"

import { useEffect } from "react"

import { ErrorState } from "@cortex/ui"

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[login error]", error)
  }, [error])

  return (
    <ErrorState
      title="Couldn't load the sign-in page"
      description="Try again, or come back in a moment."
      onRetry={reset}
      retryLabel="Try again"
    />
  )
}
