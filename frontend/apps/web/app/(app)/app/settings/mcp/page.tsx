/**
 * MCP — `/app/settings/mcp`.
 *
 * **F7 Part 1 (Task 7).** Placeholder route. The full
 * UI ships in F7-Part 3 (MCP overview + token
 * generation + one-time reveal).
 */
import { Card, CardContent, Icon } from "@cortex/ui"

export default function McpPage() {
  return (
    <Card data-testid="mcp-placeholder">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div
          aria-hidden
          className="flex h-10 w-10 items-center justify-center rounded-full bg-volt-500/10 text-volt-400"
        >
          <Icon name="Workflow" className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-base font-semibold tracking-tight">MCP</h2>
          <p className="mx-auto max-w-sm text-sm text-paper-200/70">
            Connect MCP-compatible AI clients to your Cortex knowledge base. Token generation and
            one-time reveal coming in F7-Part 3.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
