/**
 * (app) route group — loading shell.
 *
 * Renders inside the (app) layout so the sidebar +
 * topbar stay mounted while a page is loading. Just
 * a centered spinner — pages can override with their
 * own `loading.tsx` if they want skeleton UI.
 */

import { Spinner } from "@cortex/ui"

export default function AppLoading() {
  return (
    <output
      className="flex min-h-[50vh] items-center justify-center"
      aria-live="polite"
    >
      <Spinner size="lg" />
    </output>
  )
}
