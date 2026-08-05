/**
 * Register error boundary.
 */

"use client"

import { useEffect } from "react"

export default function RegisterError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[register error]", error)
  }, [error])

  return (
    <div className="space-y-3" role="alert">
      <h2 className="font-display text-lg font-semibold">Couldn't load the sign-up page</h2>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
      >
        Try again
      </button>
    </div>
  )
}
