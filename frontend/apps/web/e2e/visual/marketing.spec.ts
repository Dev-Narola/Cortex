/**
 * Visual regression — marketing surface.
 *
 * **F10 Part 3 (Tasks 4, 11, 12).** Captures the
 * light-theme marketing routes in their settled state.
 *
 * The marketing surface is structurally light theme;
 * the `prepareForScreenshot` helper enforces this even
 * if the test runs against an arbitrary URL.
 *
 * **Run this on the live environment** to generate the
 * initial baselines. The first run is expected to write
 * the snapshots; subsequent runs compare against them.
 *
 * ```bash
 * # First run: write baselines
 * pnpm --filter @cortex/web exec playwright test e2e/visual/marketing --update-snapshots
 *
 * # Subsequent runs: compare
 * pnpm --filter @cortex/web exec playwright test e2e/visual/marketing
 * ```
 *
 * The test names + snapshot names are stable; review the
 * resulting PNGs in `e2e/visual/marketing.spec.ts-snapshots/`
 * to approve the baselines.
 */
import { test } from "@playwright/test"

import { prepareForScreenshot, snapshot } from "./helpers"

test.describe("marketing visual regression", () => {
  test("homepage (hero + problem + solution + features + demo + CTA + footer)", async ({
    page,
  }) => {
    await page.goto("/")
    await prepareForScreenshot(page, { theme: "light" })
    await snapshot(page, "marketing-home", { fullPage: true })
  })

  test("homepage hero (above-the-fold)", async ({ page }) => {
    await page.goto("/")
    await prepareForScreenshot(page, { theme: "light" })
    // Above-the-fold only — the user sees this on first paint.
    // 1280x720 is the project's Desktop Chrome default.
    await page.setViewportSize({ width: 1280, height: 720 })
    await snapshot(page, "marketing-home-hero", {
      scope: "main, [data-testid='marketing-header']",
    })
  })

  test("pricing page", async ({ page }) => {
    await page.goto("/pricing")
    await prepareForScreenshot(page, { theme: "light" })
    await snapshot(page, "marketing-pricing", { fullPage: true })
  })

  test("homepage mobile (375x667 iPhone SE)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto("/")
    await prepareForScreenshot(page, { theme: "light" })
    await snapshot(page, "marketing-home-mobile", { fullPage: true })
  })
})
