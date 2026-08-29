/**
 * Visual regression — auth surface.
 *
 * **F10 Part 3 (Task 5).** Captures the auth routes
 * in their default + validation-error states.
 *
 * The auth surface is structurally light theme
 * (it sits in the `(marketing)` route group, which
 * `app/(marketing)/layout.tsx` forces to light).
 *
 * **Note on validation errors.** The test types a
 * deliberately bad email + password and waits for
 * the error message to render. The exact error
 * string is intentionally **not** asserted via
 * `toHaveText()` — the test pins the visual
 * treatment (icon + label + role="alert") instead.
 */
import { expect, test } from "@playwright/test"

import { prepareForScreenshot, snapshot } from "./helpers"

test.describe("auth visual regression", () => {
  test("login default", async ({ page }) => {
    await page.goto("/login")
    await prepareForScreenshot(page, { theme: "light" })
    await snapshot(page, "auth-login", { fullPage: true })
  })

  test("login validation error", async ({ page }) => {
    await page.goto("/login")
    await prepareForScreenshot(page, { theme: "light" })
    await page.getByLabel("Email").fill("nobody@example.com")
    await page.getByLabel("Password").fill("wrong-password")
    await page.getByRole("button", { name: /sign in/i }).click()
    // Wait for the error alert to render.
    await expect(page.getByRole("alert")).toBeVisible()
    await snapshot(page, "auth-login-error", { fullPage: true })
  })

  test("register default", async ({ page }) => {
    await page.goto("/register")
    await prepareForScreenshot(page, { theme: "light" })
    await snapshot(page, "auth-register", { fullPage: true })
  })

  test("forgot password default", async ({ page }) => {
    await page.goto("/forgot-password")
    await prepareForScreenshot(page, { theme: "light" })
    await snapshot(page, "auth-forgot-password", { fullPage: true })
  })

  test("workspace setup default", async ({ page }) => {
    await page.goto("/workspace-setup")
    await prepareForScreenshot(page, { theme: "light" })
    await snapshot(page, "auth-workspace-setup", { fullPage: true })
  })
})
