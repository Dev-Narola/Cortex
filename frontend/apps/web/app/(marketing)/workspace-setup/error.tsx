/**
 * Workspace-setup error boundary.
 */

"use client"

import { useEffect } from "react"

import { ErrorState } from "@cortex/ui"

export default function WorkspaceSetupError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[workspace-setup error]", error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <ErrorState
        title="Couldn't load the workspace setup"
        description="Try again, or come back in a moment."
        onRetry={reset}
        retryLabel="Try again"
      />
    </div>
  )
}
