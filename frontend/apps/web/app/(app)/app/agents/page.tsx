/**
 * Agents list — `/app/agents`.
 */
export default function AgentsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Agents</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Multi-step tool-calling agents. Click into one to inspect the last 50 runs.
      </p>
    </div>
  )
}
