/**
 * Footer — F8 Part 5.
 *
 * Tests the public marketing footer's
 * surface contract:
 *   - The footer is a semantic <footer>
 *     with an accessible heading.
 *   - The brand wordmark is present and
 *     links to "/".
 *   - Three navigation columns exist
 *     (Product, Resources, Legal), each
 *     with an aria-label.
 *   - Product links route to real
 *     authenticated product surfaces
 *     (anonymous users land on auth
 *     naturally).
 *   - Resources links route to real
 *     authenticated settings surfaces.
 *   - Legal column exists as a landmark
 *     but ships empty — no Privacy / Terms
 *     dead links.
 *   - No fake GitHub link (Cortex repo
 *     is private; per the F8 P5 spec
 *     "GitHub if public", a dead link is
 *     worse than no link).
 *   - Mono caption typography (JetBrains
 *     Mono via the font-mono utility).
 *   - Copyright renders with the current
 *     year.
 *   - Each link is keyboard accessible
 *     (real <a> elements with href).
 */
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Footer } from "@/components/marketing/footer"

describe("Footer", () => {
  it("renders the footer with the documented testid", () => {
    render(<Footer />)
    const footer = screen.getByTestId("marketing-footer")
    expect(footer).toBeInTheDocument()
    expect(footer.tagName).toBe("FOOTER")
  })

  it("renders an accessible heading for the footer landmark", () => {
    render(<Footer />)
    const heading = screen.getByRole("heading", { level: 2, hidden: true })
    expect(heading).toHaveTextContent(/site footer/i)
  })

  it("renders the brand wordmark and links to home", () => {
    render(<Footer />)
    const footer = screen.getByTestId("marketing-footer")
    const brandLink = within(footer).getByRole("link", {
      name: /cortex.*home/i,
    })
    expect(brandLink).toHaveAttribute("href", "/")
  })

  it("renders the three navigation columns (Product / Resources / Legal)", () => {
    render(<Footer />)
    const footer = screen.getByTestId("marketing-footer")
    // The three column landmarks should
    // exist with the right aria-labels.
    for (const label of ["Product", "Resources", "Legal"]) {
      expect(
        within(footer).getByRole("navigation", { name: new RegExp(`^${label}$`) }),
      ).toBeInTheDocument()
    }
    // And the per-column testids are
    // present for downstream tests
    // / Playwright selectors.
    expect(within(footer).getByTestId("footer-nav-product")).toBeInTheDocument()
    expect(within(footer).getByTestId("footer-nav-resources")).toBeInTheDocument()
    expect(within(footer).getByTestId("footer-nav-legal")).toBeInTheDocument()
  })

  it("renders the Product column with the four real product surfaces", () => {
    render(<Footer />)
    const productNav = screen.getByTestId("footer-nav-product")
    const links = within(productNav).getAllByRole("link")
    const hrefs = links.map((l) => l.getAttribute("href"))
    expect(hrefs).toContain("/app/dashboard")
    expect(hrefs).toContain("/app/graph")
    expect(hrefs).toContain("/app/documents")
    expect(hrefs).toContain("/app/conversations")
    // And the labels read naturally
    // (no marketing-only labels leaking
    // into the real product nav).
    const labels = links.map((l) => l.textContent?.trim())
    expect(labels).toContain("Dashboard")
    expect(labels).toContain("Knowledge graph")
    expect(labels).toContain("Documents")
    expect(labels).toContain("Conversations")
  })

  it("renders the Resources column with real settings surfaces", () => {
    render(<Footer />)
    const resourcesNav = screen.getByTestId("footer-nav-resources")
    const links = within(resourcesNav).getAllByRole("link")
    const hrefs = links.map((l) => l.getAttribute("href"))
    // Each href must be a real
    // settings surface — F7 shipped
    // /app/settings/{team,api-keys,
    // usage,audit-log}.
    expect(hrefs).toContain("/app/settings/team")
    expect(hrefs).toContain("/app/settings/api-keys")
    expect(hrefs).toContain("/app/settings/usage")
    expect(hrefs).toContain("/app/settings/audit-log")
  })

  it("renders the Legal column as a landmark but ships no fake destinations", () => {
    // The F8 P5 spec is explicit: if
    // Privacy / Terms don't exist, don't
    // ship a link to them. The landmark
    // stays for screen reader navigation
    // predictability; the body explains
    // that policies are coming.
    render(<Footer />)
    const legalNav = screen.getByTestId("footer-nav-legal")
    expect(within(legalNav).queryAllByRole("link")).toHaveLength(0)
    expect(legalNav.textContent).toMatch(/coming soon/i)
  })

  it("does NOT ship a dead GitHub link (Cortex repo is private)", () => {
    // The F8 P5 spec is explicit:
    // "GitHub if public — if it is private,
    // don't show a dead GitHub link."
    // Cortex is a private repo today.
    render(<Footer />)
    const footer = screen.getByTestId("marketing-footer")
    for (const link of within(footer).getAllByRole("link")) {
      const href = link.getAttribute("href") ?? ""
      // Reject any link to github.com /
      // a /github anchor.
      expect(href).not.toMatch(/github\.com/i)
      expect(href).not.toMatch(/^\/github/)
    }
    // The brand is a "Cortex — home" link,
    // not a GitHub fork-me-on link.
    expect(within(footer).queryByText(/fork me on github/i)).not.toBeInTheDocument()
  })

  it("uses mono caption typography (JetBrains Mono via the font-mono utility)", () => {
    render(<Footer />)
    const footer = screen.getByTestId("marketing-footer")
    expect(footer.className).toMatch(/font-mono/)
  })

  it("renders the copyright line with a year", () => {
    render(<Footer />)
    const copyright = screen.getByTestId("footer-copyright")
    expect(copyright.textContent).toMatch(/©\s+\d{4}\s+Cortex/i)
    // The year is the current year
    // (sanity check; prevents the
    // copy from being hardcoded to
    // a stale value like 2024).
    const currentYear = new Date().getFullYear()
    expect(copyright.textContent).toMatch(new RegExp(`${currentYear}`))
  })

  it("uses real <a> elements with href (keyboard-accessible)", () => {
    render(<Footer />)
    const footer = screen.getByTestId("marketing-footer")
    for (const link of within(footer).getAllByRole("link")) {
      const href = link.getAttribute("href")
      // Every link in the footer is
      // either an in-page anchor (starts
      // with #) or a real route (starts
      // with /). No empty href, no
      // javascript: URLs.
      expect(href).toBeTruthy()
      expect(href).not.toMatch(/^javascript:/i)
      // And the element is actually an
      // <a> (not a div with a click
      // handler).
      expect(link.tagName).toBe("A")
    }
  })

  it("does NOT use the Spark gradient as a background (footer is calm)", () => {
    const { container } = render(<Footer />)
    // The footer's bg-spark uses are
    // limited to the tiny brand dot
    // (a single class on a single span).
    // The footer section itself uses
    // bg-background/60 — no full-bleed
    // Spark gradient.
    const footer = screen.getByTestId("marketing-footer")
    expect(footer.className).not.toMatch(/\bbg-spark\b/)
    // Sanity: the footer doesn't have
    // any oversized SVG decoration
    // (the spec is explicit: no floating
    // nodes, no big animation, no giant
    // gradient at the footer).
    const svgs = container.querySelectorAll("svg")
    expect(svgs).toHaveLength(0)
  })
})
