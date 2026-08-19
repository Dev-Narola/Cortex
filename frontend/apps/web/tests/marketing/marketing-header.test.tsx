/**
 * MarketingHeader — F8 Part 1.
 *
 * Tests the public marketing navigation:
 *   - Brand wordmark is present.
 *   - The 3 nav anchors are present.
 *   - The "Log in" link goes to /login.
 *   - The "Get started" CTA goes to
 *     /register.
 *   - The header is a semantic <header>
 *     with a <nav> child.
 *   - Workspace-only links (Dashboard,
 *     Documents, Settings) are NOT
 *     present.
 */

import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { MarketingHeader } from "@/components/marketing/marketing-header"

describe("MarketingHeader", () => {
  it("renders the brand wordmark", () => {
    render(<MarketingHeader />)
    const header = screen.getByTestId("marketing-header")
    expect(within(header).getByText("Cortex")).toBeInTheDocument()
  })

  it("renders the three marketing nav anchors", () => {
    render(<MarketingHeader />)
    const header = screen.getByTestId("marketing-header")
    const nav = within(header).getByRole("navigation", {
      name: /marketing navigation/i,
    })
    expect(within(nav).getByText("Product")).toBeInTheDocument()
    expect(within(nav).getByText("How it works")).toBeInTheDocument()
    expect(within(nav).getByText("Technology")).toBeInTheDocument()
  })

  it("renders the public CTAs", () => {
    render(<MarketingHeader />)
    expect(
      screen.getByRole("link", { name: /log in/i }),
    ).toHaveAttribute("href", "/login")
    expect(
      screen.getByRole("link", { name: /get started/i }),
    ).toHaveAttribute("href", "/register")
  })

  it("is a semantic <header> with a <nav> child", () => {
    render(<MarketingHeader />)
    const header = screen.getByTestId("marketing-header")
    expect(header.tagName).toBe("HEADER")
    expect(within(header).getByRole("navigation")).toBeInTheDocument()
  })

  it("does NOT expose workspace-only links", () => {
    render(<MarketingHeader />)
    // The (app) route group's nav lives in
    // SidebarNav, not here. None of those
    // routes should appear.
    for (const path of [
      "/app",
      "/app/dashboard",
      "/app/documents",
      "/app/graph",
      "/app/conversations",
      "/app/settings",
    ]) {
      expect(
        screen.queryByRole("link", { name: new RegExp(path, "i") }),
      ).not.toBeInTheDocument()
    }
  })

  it("brand link points to home", () => {
    render(<MarketingHeader />)
    const header = screen.getByTestId("marketing-header")
    const brandLink = within(header).getByRole("link", {
      name: /cortex.*home/i,
    })
    expect(brandLink).toHaveAttribute("href", "/")
  })
})
