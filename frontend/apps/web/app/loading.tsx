/**
 * Route-level loading UI — shown during route transitions and
 * for routes that opt into streaming.
 *
 * **F0 scope (Task 37).** Generic loading screen for every
 * route group. Per-route skeletons (e.g. a Documents-table
 * shimmer) ship with the feature that owns them, not here.
 *
 * The component is a Server Component by default — no `"use client"`
 * directive. That keeps the cost at first paint to zero JS bytes
 * and means the loading state is shown immediately on slow
 * networks.
 */
export default function Loading() {
  return (
    <output
      aria-live="polite"
      aria-label="Loading"
      className="flex min-h-screen items-center justify-center bg-background"
    >
      <div className="flex flex-col items-center gap-4">
        {/* Pulsing brand mark — the only motion in F0 loading UI. */}
        <div aria-hidden="true" className="h-10 w-10 animate-pulse rounded-xl bg-spark" />
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Loading</p>
      </div>
    </output>
  )
}
