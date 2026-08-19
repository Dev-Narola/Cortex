/**
 * Team — `/app/settings/team`.
 *
 * **F7 Part 1 (Task 11).** The first real Settings
 * screen. The route is intentionally thin — the
 * heavy lifting lives in `TeamPanel` so the
 * component can be reused (e.g. inside a future
 * "Switch workspace" dropdown or a settings modal).
 *
 * **Why a thin route.** Every `(app)/<feature>/page.tsx`
 * in the codebase is the same shape:
 *
 *   page.tsx
 *     ↓
 *   <FeaturePanel />
 *     ↓
 *   TanStack Query → service → backend
 *
 * Keeping the route thin means the route file is
 * always readable in 10 lines and the component
 * is the unit of reuse + testing.
 */

import { TeamPanel } from "@/components/settings/team/team-panel"

export default function TeamPage() {
  return <TeamPanel />
}
