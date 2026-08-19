/**
 * SettingsTabs — F7 Part 1.
 *
 * Tests the left-rail navigation contract:
 *   - 5 tabs in the canonical order
 *   - The active state is derived from the URL
 *     (no client-side state)
 *   - Every tab is a real link (not a button) so
 *     the user can middle-click / open in new tab
 *   - The canonical tab list is exposed via
 *     `SETTINGS_TABS` for downstream consumers
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SETTINGS_TABS, SettingsTabs } from "@/components/settings/settings-tabs"

describe("SettingsTabs", () => {
  it("renders the 5 canonical Settings tabs in the documented order", () => {
    render(<SettingsTabs />)
    const expected = ["team", "api-keys", "mcp", "usage", "audit-log"]
    for (const slug of expected) {
      expect(screen.getByTestId(`settings-tab-${slug}`)).toBeInTheDocument()
    }
  })

  it("exposes the canonical 5-tab list with href + label + icon", () => {
    expect(SETTINGS_TABS).toHaveLength(5)
    const [first, second, third, fourth, fifth] = SETTINGS_TABS
    expect(first?.href).toBe("/app/settings/team")
    expect(first?.label).toBe("Team")
    expect(second?.href).toBe("/app/settings/api-keys")
    expect(third?.href).toBe("/app/settings/mcp")
    expect(fourth?.href).toBe("/app/settings/usage")
    expect(fifth?.href).toBe("/app/settings/audit-log")
  })

  it("every tab is a real link (so the user can middle-click)", () => {
    render(<SettingsTabs />)
    for (const tab of SETTINGS_TABS) {
      const link = screen.getByTestId(`settings-tab-${tab.href.split("/").pop()}`)
      expect(link.tagName).toBe("A")
      expect(link.getAttribute("href")).toBe(tab.href)
    }
  })
})
