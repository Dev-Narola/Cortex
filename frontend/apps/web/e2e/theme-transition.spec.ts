import { test, expect } from "@playwright/test";

/**
 * Theme transition — the Stage 4 view-transition morph.
 *
 * Verifies that clicking the theme toggle actually flips the
 * `dark` class on `<html>` (the contract for the view
 * transition). The morph itself is a browser-level
 * animation; Playwright cannot observe it directly, but it
 * can observe the class change that triggers it.
 */
test.describe("theme", () => {
  test("toggle flips the dark class on <html>", async ({ page }) => {
    await page.goto("/login");
    const html = page.locator("html");
    const before = (await html.getAttribute("class")) ?? "";
    await page.getByRole("button", { name: /switch to (dark|light) mode/i }).click();
    // Give the view transition a tick to commit.
    await page.waitForTimeout(200);
    const after = (await html.getAttribute("class")) ?? "";
    expect(after).not.toBe(before);
  });
});
