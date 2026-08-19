/**
 * Usage & Billing — `/app/settings/usage`.
 *
 * **F7 Part 4 (Task 2).** Thin route that
 * mounts `<UsagePanel />` — same pattern as
 * the F7 Part 1 / Part 2 / Part 3 Settings
 * pages.
 */
import { UsagePanel } from "@/components/settings/usage/usage-panel"

export default function UsagePage() {
  return <UsagePanel />
}
