/**
 * API Keys — `/app/settings/api-keys`.
 *
 * **F7 Part 1 (Task 7).** Placeholder route. The full
 * UI ships in F7-Part 2 (generate / list / revoke /
 * one-time reveal). For Part 1, the page exists so the
 * Settings navigation doesn't 404, and shows a clear
 * "Coming next" notice.
 *
 * **Why a stub, not the full UI.** The roadmap splits
 * F7 into Part 1 (Settings shell + Team), Part 2 (API
 * Keys), Part 3 (MCP), Part 4 (Usage & Billing), Part 5
 * (Audit Log). Shipping each part in turn keeps the
 * review surface manageable and lets the user spec for
 * each area land first.
 */
import { Card, CardContent, Icon } from "@cortex/ui"

export default function ApiKeysPage() {
  return (
    <Card data-testid="api-keys-placeholder">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div
          aria-hidden
          className="flex h-10 w-10 items-center justify-center rounded-full bg-volt-500/10 text-volt-400"
        >
          <Icon name="KeyRound" className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-base font-semibold tracking-tight">API Keys</h2>
          <p className="mx-auto max-w-sm text-sm text-paper-200/70">
            Generate, list, and revoke API keys for connecting external tools to your Cortex
            workspace. Coming in F7-Part 2.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
