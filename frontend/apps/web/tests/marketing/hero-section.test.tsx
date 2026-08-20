/**
 * HeroSection — F8 Part 1 (with Part 5
 * updates).
 *
 * Tests the hero's surface contract:
 *   - Headline renders with the
 *     differentiated Cortex thesis.
 *   - Spark gradient is applied to the
 *     "connected" word (the single major
 *     Spark moment of the page).
 *   - Supporting copy renders.
 *   - Both CTA buttons render with the
 *     correct destinations.
 *   - The hero visual is present and
 *     aria-hidden (decorative).
 *   - The hero background is present and
 *     aria-hidden.
 *   - Heading hierarchy: the hero is the
 *     h1; downstream h2s land on the F8
 *     story sections.
 *   - F8 Part 5: the section exposes
 *     `id="product"` for the marketing
 *     nav's Product anchor; the secondary
 *     CTA became the "See it work ↓"
 *     in-page anchor targeting `#demo`.
 *
 * **Animation timing is intentionally
 * NOT tested.** GSAP timeline durations
 * are brittle to assert; we test the
 * surface, not the animation.
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// GSAP is a client-only dependency; mock
// it so the test environment doesn't try
// to import the real GSAP bundle.
vi.mock("gsap", () => ({
  gsap: {
    timeline: () => ({
      fromTo: vi.fn().mockReturnThis(),
    }),
  },
}))

import { HeroSection } from "@/components/marketing/hero/hero-section"

describe("HeroSection", () => {
  it("renders the h1 headline with the Cortex thesis", () => {
    render(<HeroSection />)
    const h1 = screen.getByRole("heading", { level: 1 })
    expect(h1).toHaveTextContent(/scattered/i)
    expect(h1).toHaveTextContent(/knowledge/i)
    expect(h1).toHaveTextContent(/connected/i)
  })

  it("applies the Spark gradient to the 'connected' word", () => {
    render(<HeroSection />)
    // The third word in the headline is
    // the "Spark moment" per the F8 spec.
    const sparkWord = screen.getByText("connected")
    expect(sparkWord).toHaveClass("text-spark")
  })

  it("renders the supporting copy", () => {
    render(<HeroSection />)
    expect(
      screen.getByText(/hybrid search, a live knowledge graph/i),
    ).toBeInTheDocument()
  })

  it("renders the primary CTA pointing to /register", () => {
    render(<HeroSection />)
    expect(
      screen.getByRole("link", { name: /start free/i }),
    ).toHaveAttribute("href", "/register")
  })

  it("renders the 'See it work' secondary CTA targeting the demo section", () => {
    // F8 Part 5: the secondary CTA
    // became an in-page anchor that
    // scrolls down to the live demo. The
    // sign-in route stays available via
    // the marketing header.
    render(<HeroSection />)
    const seeItWork = screen.getByTestId("hero-see-it-work")
    expect(seeItWork).toHaveAttribute("href", "#demo")
    expect(seeItWork).toHaveTextContent(/see it work/i)
  })

  it("does not duplicate the sign-in link inside the hero", () => {
    // The "Log in" link is owned by the
    // MarketingHeader, not the hero. The
    // hero used to ship its own "Sign in"
    // CTA (F8 P1); F8 P5 removed it.
    render(<HeroSection />)
    expect(
      screen.queryByRole("link", { name: /^sign in$/i }),
    ).not.toBeInTheDocument()
  })

  it("renders the hero visual and marks it decorative", () => {
    const { container } = render(<HeroSection />)
    const visual = screen.getByTestId("hero-visual")
    expect(visual).toBeInTheDocument()
    expect(visual).toHaveAttribute("aria-hidden", "true")
    // The visual contains the SVG node
    // field.
    expect(container.querySelector("svg")).toBeInTheDocument()
  })

  it("renders the hero background and marks it decorative", () => {
    render(<HeroSection />)
    const bg = screen.getByTestId("hero-background")
    expect(bg).toBeInTheDocument()
    expect(bg).toHaveAttribute("aria-hidden", "true")
  })

  it("the section is the page's primary heading region", () => {
    render(<HeroSection />)
    const h1 = screen.getByRole("heading", { level: 1 })
    // aria-labelledby wires the section
    // to the h1.
    const section = h1.closest("section")
    expect(section).toHaveAttribute("aria-labelledby", h1.id)
  })

  it("exposes id='product' for the marketing nav Product anchor", () => {
    // F8 Part 5: the hero is the natural
    // "Product" landing point. The header
    // links #product here.
    const { container } = render(<HeroSection />)
    const product = container.querySelector("section#product")
    expect(product).not.toBeNull()
  })
})
