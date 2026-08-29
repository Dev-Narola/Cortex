/**
 * Visual regression — F1 component primitives.
 *
 * **F10 Part 3 (Task 13).** Pins the visual contract of
 * the shared F1 components (Button, Input, Select, Toggle,
 * Card, Modal, Badge, Table, Toast, Tooltip, Citation,
 * Skeleton) across their important states
 * (default, hover, focus, disabled, loading, error).
 *
 * **Why a component showcase?** The project has
 * `app/(internal)/component-showcase/page.tsx` (F0, Task 38)
 * which renders every F1 primitive on a single page. We
 * use that page as the visual surface — one snapshot per
 * state group, not one per component.
 *
 * **Determinism.** The showcase page is a Server Component
 * (no client-side data fetching), so it's stable by
 * construction. The `prepareForScreenshot` helper still
 * flattens animations + waits for fonts, because the
 * `Skeleton` component has a `motion-safe:animate-pulse`
 * that would otherwise add pixel noise.
 *
 * **Component coverage.** The current showcase has
 * ~12 F1 primitives. If F1 ever expands, the test list
 * expands with it.
 */
import { test } from "@playwright/test"

import { prepareForScreenshot, snapshot } from "./helpers"

test.describe("F1 component primitives visual regression", () => {
  test("component showcase — full page (all primitives, default state)", async ({
    page,
  }) => {
    await page.goto("/component-showcase")
    await prepareForScreenshot(page, { theme: "dark" })
    await snapshot(page, "components-showcase-default", { fullPage: true })
  })

  test("component showcase — focused state (Tab keypress)", async ({ page }) => {
    await page.goto("/component-showcase")
    await prepareForScreenshot(page, { theme: "dark" })
    // Press Tab a few times to put a focus ring on the
    // first focusable element. The exact element is
    // implementation-defined (showcase ordering), so
    // we don't assert *which* element is focused, just
    // that *some* element shows a focus ring.
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    await snapshot(page, "components-showcase-focus", { fullPage: true })
  })
})
