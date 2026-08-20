/**
 * SolutionSection — F8 Part 2.
 *
 * Tests the solution section's surface
 * contract:
 *   - The "scattered → connected"
 *     transformation is stated.
 *   - The Spark gradient is applied
 *     to the "connected" word (the
 *     same single Spark moment from
 *     the hero; the marketing page
 *     intentionally repeats it
 *     because it's the conceptual
 *     answer to the problem).
 *   - The supporting copy doesn't
 *     duplicate the hero CTA.
 *   - Section has a stable id.
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SolutionSection } from "@/components/marketing/solution/solution-section"

describe("SolutionSection", () => {
  it("renders the eyebrow", () => {
    render(<SolutionSection />)
    expect(screen.getByText(/the solution/i)).toBeInTheDocument()
  })

  it("renders the scattered → connected transformation", () => {
    render(<SolutionSection />)
    const h2 = screen.getByRole("heading", { level: 2 })
    expect(h2).toHaveTextContent(/scattered/i)
    expect(h2).toHaveTextContent(/connected/i)
  })

  it("applies the Spark gradient to the 'connected' word", () => {
    render(<SolutionSection />)
    // The Spark moment is repeated here
    // because the transformation is the
    // same conceptual beat as the hero.
    // The class is the existing
    // `.text-spark` from @cortex/ui.
    const connected = screen.getByText("connected")
    expect(connected).toHaveClass("text-spark")
  })

  it("strikes through 'scattered' to visually communicate the transformation", () => {
    render(<SolutionSection />)
    // The visual strike-through is
    // intentional — it carries the
    // "this is what we're moving
    // away from" signal.
    const scattered = screen.getByText("scattered")
    expect(scattered.className).toMatch(/line-through/)
  })

  it("does NOT duplicate the hero's 'Get started' / 'Start free' CTA", () => {
    render(<SolutionSection />)
    expect(screen.queryByRole("link", { name: /start free/i })).toBeNull()
    expect(screen.queryByRole("link", { name: /get started/i })).toBeNull()
    expect(screen.queryByRole("link", { name: /sign in/i })).toBeNull()
  })

  it("has a stable id for the marketing nav", () => {
    const { container } = render(<SolutionSection />)
    const section = container.querySelector("section#solution")
    expect(section).not.toBeNull()
  })

  it("uses semantic h2 (not h3)", () => {
    render(<SolutionSection />)
    const h2 = screen.getByRole("heading", { level: 2 })
    expect(h2.id).toBe("solution-heading")
  })
})
