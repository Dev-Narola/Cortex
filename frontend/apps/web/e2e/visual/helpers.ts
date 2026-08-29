/**
 * Visual regression helpers — shared utilities for the
 * `e2e/visual/` test suite.
 *
 * **F10 Part 3 (Tasks 14, 15, 20).** These helpers handle
 * the determinism requirements for visual regression:
 *
 *   - **Disable animations** before any screenshot, so the
 *     R3F graph + the GSAP hero timeline + the live demo
 *     streaming caret + the loading-state pulse don't
 *     produce pixel-level noise between runs.
 *   - **Wait for the network to settle** before screenshotting,
 *     so a `loading.tsx` skeleton doesn't appear in the
 *     baseline.
 *   - **Login helper** that uses a stable test account,
 *     not real credentials.
 *   - **Mock data reset** — random IDs, timestamps, LLM
 *     responses are not allowed in the visual surface
 *     (see Task 14 / 20).
 *
 * **The F0 spec is explicit** about deterministic visual
 * baselines. These helpers are the single place where
 * those guarantees are implemented.
 */
import { expect, type Page, type PlaywrightTestArgs } from "@playwright/test"

/**
 * Set up the page for a deterministic screenshot:
 * 1. disable animations + transitions (CSS injection that
 *    flattens everything to 0s, mirroring the F9 P3
 *    `prefers-reduced-motion` contract)
 * 2. force the light theme on marketing routes; force the
 *    dark theme on app routes
 * 3. wait for the network to settle
 * 4. wait for the project's canonical `font-sans` /
 *    `font-display` / `font-mono` CSS variables to resolve
 *    (the F0 next/font setup uses `display: swap`, so a
 *    screenshot taken before the variable font finishes
 *    loading would capture the fallback)
 */
export async function prepareForScreenshot(
  page: Page,
  options: { theme: "light" | "dark" } = { theme: "light" },
): Promise<void> {
  // F9 P3 contract: flatten every animation + transition to
  // 0.01ms. This matches the production CSS for users who
  // have `prefers-reduced-motion: reduce`, so the visual
  // baseline represents the "settled" state the user sees.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-delay: 0ms !important;
        transition-duration: 0.01ms !important;
        transition-delay: 0ms !important;
        caret-color: transparent !important;
      }
    `,
  })

  // The marketing surface is structurally light; the app
  // surface is structurally dark. The (marketing) + (app)
  // route groups in `app/layout.tsx` enforce this; this
  // helper is just a safety net for any test that runs
  // against an arbitrary URL.
  if (options.theme === "dark") {
    await page.evaluate(() => {
      document.documentElement.classList.add("dark")
      document.documentElement.classList.remove("light")
    })
  } else {
    await page.evaluate(() => {
      document.documentElement.classList.remove("dark")
      document.documentElement.classList.add("light")
    })
  }

  // Wait for the network to settle + the fonts to load.
  await page.waitForLoadState("networkidle")
  await page.evaluate(() => document.fonts.ready)
}

/**
 * Screenshot the current page state with a stable name.
 * Wraps `expect(page).toHaveScreenshot()` so the test
 * names + the snapshot filenames stay consistent across
 * the suite.
 */
export async function snapshot(
  page: Page,
  name: string,
  options: {
    fullPage?: boolean
    /** Element selector to scope the snapshot to. */
    scope?: string
    /** Maximum acceptable pixel-diff ratio. Defaults to
     *  Playwright's threshold (~0.2). Loosen this for
     *  screens with continuous animation (e.g. 3D graph). */
    maxDiffPixelRatio?: number
  } = {},
): Promise<void> {
  const { fullPage = false, scope, maxDiffPixelRatio } = options

  if (scope) {
    const element = page.locator(scope)
    await expect(element).toHaveScreenshot(`${name}.png`, {
      maxDiffPixelRatio,
    })
    return
  }

  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage,
    maxDiffPixelRatio,
  })
}

/**
 * Sign in as a stable test user. **Never** commit real
 * credentials; use the dedicated visual-regression test
 * account that the backend's seed script creates.
 *
 * The flow:
 *   1. navigate to `/login`
 *   2. fill the email + password
 *   3. click "Sign in"
 *   4. wait for the redirect to `/app/dashboard`
 *
 * If the redirect doesn't happen within 10s, the helper
 * throws — that's a real failure, not a flake, because
 * the backend is either down or the seed account is
 * missing.
 */
export async function signInAsTestUser(
  args: PlaywrightTestArgs,
  credentials: { email: string; password: string },
): Promise<void> {
  const { page } = args
  await page.goto("/login")
  await page.getByLabel("Email").fill(credentials.email)
  await page.getByLabel("Password").fill(credentials.password)
  await page.getByRole("button", { name: /sign in/i }).click()
  await page.waitForURL(/\/app/, { timeout: 10_000 })
}
