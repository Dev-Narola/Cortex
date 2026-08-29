/**
 * Playwright config — end-to-end browser tests.
 *
 * **F0 scope (Task 33).** Per the spec, the e2e suite runs
 * against the three major rendering engines. Today the suite
 * has no test cases — the spec calls for "Future E2E tests:
 * Login, Upload, Chat, Search" and those ship with their
 * respective feature phases. The config wires the runners so
 * the first feature test gets a real browser matrix for free.
 *
 * **F10 Part 3** added a fourth project (`visual-chromium`)
 * for the visual-regression suite. The visual project uses
 * a separate folder convention so it can opt out of retries
 * (a flaky visual diff is always a real diff, not a flake)
 * and pin pixel-ratio tolerance to a single value. The
 * visual-regression README at `e2e/visual/README.md`
 * documents the workflow.
 */

import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    // F10 Part 3: the visual-regression project. Same
    // Chromium engine as the regular e2e suite, but with
    // retries disabled (a flaky visual diff is always a
    // real diff, not a flake — see the F10-Part 3
    // §"Failure review" docs). `workers` is a top-level
    // option, not a per-project option.
    {
      name: "visual-chromium",
      testMatch: /e2e\/visual\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      retries: 0,
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
