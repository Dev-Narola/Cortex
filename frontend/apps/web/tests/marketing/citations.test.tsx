/**
 * CitationsSection — F8 Part 3.
 *
 * Tests the Citations / Trust feature
 * section:
 *   - The eyebrow + heading + description
 *     render.
 *   - The description doesn't fall into
 *     the generic "AI you can trust"
 *     trap; it commits to a specific
 *     traceability message.
 *   - The icon is present (Spark-gradient
 *     treatment).
 *   - The visual is decorative
 *     (`aria-hidden`).
 *   - The answer + citation marker +
 *     source card all render in the final
 *     state.
 *   - The source name is NOT one of the
 *     real internal Cortex project files
 *     (per the F8 spec: "Don't expose
 *     internal project files... Use
 *     fictional/neutral sample source
 *     names").
 *   - The visual starts in the idle state.
 *   - The section has a stable id.
 */

import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CitationsSection } from "@/components/marketing/features/citations"
import { CitationsVisual } from "@/components/marketing/features/citations-visual"

describe("CitationsSection", () => {
  it("renders the eyebrow + heading", () => {
    render(<CitationsSection />)
    expect(screen.getByText(/^citations$/i)).toBeInTheDocument()
    const h2 = screen.getByRole("heading", { level: 2 })
    expect(h2).toHaveTextContent(/every answer comes from somewhere/i)
  })

  it("the description commits to a specific traceability message", () => {
    render(<CitationsSection />)
    const text = screen.getByTestId("citations-text")
    // The marketing message names
    // *what* the citation does (traces to
    // document / section / page), not the
    // generic "AI you can trust" handwave.
    expect(within(text).getByText(/actually supports it/i)).toBeInTheDocument()
  })

  it("the description does NOT use the generic 'AI you can trust' phrase", () => {
    // Per the F8 spec: "Avoid generic:
    // 'AI you can trust.' That claim is
    // too broad. Instead demonstrate *why*
    // the answer can be trusted."
    render(<CitationsSection />)
    const text = screen.getByTestId("citations-text")
    const lc = text.textContent?.toLowerCase() ?? ""
    // The literal phrase is banned.
    expect(lc).not.toContain("ai you can trust")
  })

  it("renders the icon in the Spark-gradient treatment", () => {
    render(<CitationsSection />)
    const icon = screen.getByTestId("citations-icon")
    expect(icon).toBeInTheDocument()
    expect(icon.className).toMatch(/bg-spark/)
  })

  it("renders the visual and marks it decorative", () => {
    render(<CitationsSection />)
    const visual = screen.getByTestId("citations-visual")
    expect(visual).toBeInTheDocument()
    expect(visual).toHaveAttribute("aria-hidden", "true")
  })

  it("has a stable id for the marketing nav", () => {
    const { container } = render(<CitationsSection />)
    const section = container.querySelector("section#citations")
    expect(section).not.toBeNull()
  })
})

describe("CitationsVisual", () => {
  it("renders the answer + citation marker + source card", () => {
    render(<CitationsVisual />)
    expect(screen.getByTestId("citations-answer")).toBeInTheDocument()
    expect(screen.getByTestId("citation-marker-1")).toBeInTheDocument()
    expect(screen.getByTestId("citations-source-1")).toBeInTheDocument()
  })

  it("the source name is fictional/neutral — NOT an internal project file", () => {
    // Per the F8 spec: "Don't expose
    // internal project files... Use
    // fictional/neutral sample source
    // names."
    render(<CitationsVisual />)
    const name = screen.getByTestId("citation-source-name")
    const lc = name.textContent?.toLowerCase() ?? ""
    for (const internal of [
      "cortex-prd",
      "cortex-engineering-blueprint",
      "database.md",
      "ui-ux.md",
      "frontend-roadmap",
    ]) {
      expect(lc).not.toContain(internal)
    }
  })

  it("the source name is a plausible neutral document", () => {
    render(<CitationsVisual />)
    // The actual rendered text — pinned so
    // a future contributor doesn't
    // accidentally switch to a real
    // internal file.
    expect(screen.getByTestId("citation-source-name")).toHaveTextContent(
      /retrieval notes\.md/i,
    )
  })

  it("the citation marker is labelled with a number", () => {
    render(<CitationsVisual />)
    const marker = screen.getByTestId("citation-marker-1")
    expect(marker).toHaveTextContent("1")
  })

  it("starts in the idle state (data-revealed='false')", () => {
    render(<CitationsVisual />)
    const visual = screen.getByTestId("citations-visual")
    expect(visual).toHaveAttribute("data-revealed", "false")
  })

  it("the final state is understandable without the animation", () => {
    // All three pieces — answer, marker,
    // source card — are in the DOM from
    // first paint. The source name is
    // rendered, so a screen reader (or a
    // user with reduced motion) gets the
    // full traceability story.
    render(<CitationsVisual />)
    expect(screen.getByTestId("citation-source-name")).toHaveTextContent(
      /retrieval notes\.md/i,
    )
  })
})
