/**
 * FinalCTA — F8 Part 5.
 *
 * Tests the final CTA section's surface
 * contract:
 *   - The section exists with the right
 *     testid.
 *   - The heading renders with the F8 P5
 *     copy.
 *   - The supporting copy is present.
 *   - Exactly ONE primary CTA exists,
 *     pointing to the existing `/register`
 *     route (not a marketing-only
 *     destination).
 *   - The secondary "I already have a
 *     workspace" link points to `/login`.
 *   - The CTA lands in a Button (visible
 *     focus state, keyboard-accessible).
 *   - The section is calmer than the
 *     hero — no Spark gradient on the
 *     heading.
 *   - The CTA still receives the
 *     scroll-in reveal so the section
 *     animates once when the visitor
 *     scrolls to it (quieter than the
 *     hero's 1.4s timeline).
 */
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FinalCTA } from "@/components/marketing/final-cta"

describe("FinalCTA", () => {
  it("renders the section with the documented testid", () => {
    render(<FinalCTA />)
    const section = screen.getByTestId("final-cta")
    expect(section).toBeInTheDocument()
    expect(section.tagName).toBe("SECTION")
  })

  it("renders the heading with the F8 P5 copy", () => {
    render(<FinalCTA />)
    const heading = screen.getByRole("heading", { level: 2 })
    expect(heading).toHaveTextContent(/ready to work with your knowledge\?/i)
  })

  it("renders supporting copy", () => {
    render(<FinalCTA />)
    expect(screen.getByText(/searchable, citable, graph-backed/i)).toBeInTheDocument()
  })

  it("renders exactly one primary CTA pointing to /register", () => {
    // The F8 P5 spec is explicit:
    // "Only one primary CTA." This test
    // pins the surface so a future
    // contributor can't quietly add a
    // second primary button.
    render(<FinalCTA />)
    const section = screen.getByTestId("final-cta")
    const primary = within(section).getByRole("link", {
      name: /get started free/i,
    })
    expect(primary).toHaveAttribute("href", "/register")
    // No second "Get started" / "Start
    // free" / "Book demo" / "Sign up"
    // primary CTA hiding in the section.
    expect(within(section).queryByRole("link", { name: /book (a )?demo/i })).not.toBeInTheDocument()
    expect(
      within(section).queryByRole("link", { name: /talk to (sales|us)/i }),
    ).not.toBeInTheDocument()
    expect(within(section).queryByRole("link", { name: /sign up/i })).not.toBeInTheDocument()
  })

  it("renders a secondary 'I already have a workspace' link to /login", () => {
    render(<FinalCTA />)
    const secondary = screen.getByRole("link", {
      name: /i already have a workspace/i,
    })
    expect(secondary).toHaveAttribute("href", "/login")
  })

  it("is keyboard accessible — the primary CTA is a real <a>", () => {
    // The CTA is rendered as a Link
    // (Next.js) which compiles to an
    // <a>, so keyboard activation works
    // out of the box. This test pins the
    // shape so a future revision doesn't
    // accidentally swap to a div + click
    // handler.
    render(<FinalCTA />)
    const primary = screen.getByRole("link", { name: /get started free/i })
    expect(primary.tagName).toBe("A")
    // And it has a tabindex (links do by
    // default — but we assert the
    // href is set, which is the actual
    // keyboard target).
    expect(primary).toHaveAttribute("href")
  })

  it("does NOT use a Spark gradient on the heading (calmer than the hero)", () => {
    const { container } = render(<FinalCTA />)
    const heading = screen.getByRole("heading", { level: 2 })
    expect(heading.className).not.toMatch(/text-spark/)
    // Section background remains the
    // marketing default — no big
    // gradient.
    expect(container.innerHTML).not.toMatch(/bg-spark/)
  })

  it("owns a scroll-in reveal hook (the section is calmer than the hero, but still reveals once)", () => {
    // The CTA uses the same data-revealed
    // pattern as the problem / solution
    // sections. SSR renders opacity-0;
    // the useInView hook flips it to
    // opacity-100 once on scroll-in.
    render(<FinalCTA />)
    const content = screen.getByTestId("final-cta-content")
    expect(content.className).toMatch(/opacity-0/)
    expect(content.className).toMatch(/translate-y-4/)
    expect(content.dataset.revealed).toBeUndefined()
  })

  it("does NOT include a 'pricing' link (no marketing-only routes)", () => {
    // The F8 P5 spec is explicit: route
    // the CTA to the existing signup,
    // don't create /get-started,
    // /pricing, or any other marketing-
    // only flow.
    render(<FinalCTA />)
    const section = screen.getByTestId("final-cta")
    for (const link of within(section).getAllByRole("link")) {
      const href = link.getAttribute("href") ?? ""
      expect(href).not.toMatch(/^\/pricing/)
      expect(href).not.toMatch(/^\/get-started/)
      expect(href).not.toMatch(/^\/demo$/)
    }
  })
})
