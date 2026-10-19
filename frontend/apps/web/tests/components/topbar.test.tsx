/**
 * Topbar — breadcrumbs from the nav (no raw ids), theme toggle and user menu.
 */

import { render, screen } from "@testing-library/react"
import { ThemeProvider } from "next-themes"
import { describe, expect, it, vi } from "vitest"

let pathname = "/app/dashboard"
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}))

import { BreadcrumbProvider } from "@/components/navigation/BreadcrumbProvider"
import { Topbar, crumbsFor } from "@/components/navigation/Topbar"
import { ViewTransitions } from "@/lib/theme/view-transitions"

describe("crumbsFor", () => {
  it("labels from the nav and never shows raw ids", () => {
    expect(crumbsFor("/app/dashboard")).toEqual([{ label: "Dashboard" }])
    expect(crumbsFor("/chat/d0a2b21d-373b-4eea-9fa1-61da2ffec9c5")).toEqual([{ label: "Chat" }])
    expect(crumbsFor("/app/settings/team")).toEqual([{ label: "Team" }])
    expect(crumbsFor("/app/agents/a1/runs/3f2c9d1e-0000-4000-8000-000000000000")).toEqual([
      { label: "Agents", href: "/app/agents" },
      { label: "A1" },
      { label: "Runs" },
    ])
  })
})

describe("Topbar", () => {
  it("renders the theme toggle and the user menu", () => {
    pathname = "/app/dashboard"
    render(
      <ThemeProvider attribute="class" defaultTheme="dark">
        <ViewTransitions>
          <BreadcrumbProvider>
            <Topbar onOpenMobileNav={() => {}} />
          </BreadcrumbProvider>
        </ViewTransitions>
      </ThemeProvider>,
    )
    expect(screen.getByRole("button", { name: /^theme:/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /open user menu/i })).toBeInTheDocument()
  })
})
