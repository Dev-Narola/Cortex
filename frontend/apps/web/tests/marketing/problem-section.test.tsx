/**
 * ProblemSection — F8 Part 2.
 *
 * Tests the problem section's surface
 * contract:
 *   - Eyebrow + heading render.
 *   - The "scattered" + "trust" problem
 *     is communicated in plain text.
 *   - The section is intentionally
 *     restrained (no animation, no
 *     imagery, no icon).
 *   - The section has a stable id so
 *     the marketing header's nav can
 *     link to it.
 *   - Heading hierarchy is correct.
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ProblemSection } from "@/components/marketing/problem/problem-section"

describe("ProblemSection", () => {
  it("renders the eyebrow", () => {
    render(<ProblemSection />)
    expect(screen.getByText(/the problem/i)).toBeInTheDocument()
  })

  it("renders the heading with the scattered-knowledge problem", () => {
    render(<ProblemSection />)
    const h2 = screen.getByRole("heading", { level: 2 })
    // The heading communicates the
    // problem: knowledge is everywhere,
    // but trustworthy answers aren't.
    // ("scattered" lives in the
    // supporting paragraph, where the
    // spec wants the explicit word.)
    expect(h2).toHaveTextContent(/knowledge is everywhere/i)
    expect(h2).toHaveTextContent(/trust/i)
    // The supporting paragraph uses the
    // spec's wording.
    expect(
      screen.getByText(/documents, notes, wikis, reports/i),
    ).toBeInTheDocument()
  })

  it("mentions the trust problem in the supporting text", () => {
    render(<ProblemSection />)
    // The supporting paragraph must
    // call out the *trust* problem —
    // not just the *find* problem.
    // "trustworthy answer" is the
    // anchor phrase.
    expect(
      screen.getByText(/trustworthy answer/i),
    ).toBeInTheDocument()
  })

  it("has a stable id for the marketing nav", () => {
    const { container } = render(<ProblemSection />)
    const section = container.querySelector("section#problem")
    expect(section).not.toBeNull()
  })

  it("uses semantic h2 (not h3) — the section is a top-level story beat", () => {
    render(<ProblemSection />)
    const h2 = screen.getByRole("heading", { level: 2 })
    expect(h2).toBeInTheDocument()
    // And it has the right id so the
    // section's aria-labelledby wiring
    // works.
    expect(h2.id).toBe("problem-heading")
  })

  it("does NOT include decorative imagery (per the 'text is the whole point' rule)", () => {
    const { container } = render(<ProblemSection />)
    // The section must not contain
    // <img>, <svg>, or aria-hidden
    // decorative assets.
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("svg")).toBeNull()
  })
})
