/**
 * Usage & Billing — `/app/settings/usage`.
 *
 * **F7 Part 1 (Task 7).** Placeholder route. The full
 * UI ships in F7-Part 4 (usage events + plan
 * management).
 */
import { Card, CardContent, Icon } from "@cortex/ui"

export default function UsagePage() {
  return (
    <Card data-testid="usage-placeholder">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div
          aria-hidden
          className="flex h-10 w-10 items-center justify-center rounded-full bg-volt-500/10 text-volt-400"
        >
          <Icon name="ChartLine" className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-base font-semibold tracking-tight">
            Usage &amp; Billing
          </h2>
          <p className="mx-auto max-w-sm text-sm text-paper-200/70">
            Track usage events and manage your subscription. Coming in F7-Part 4.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
