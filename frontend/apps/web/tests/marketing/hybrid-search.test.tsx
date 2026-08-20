/**
 * HybridSearchSection — F8 Part 2.
 *
 * Tests the first real technical feature
 * story. Spec coverage:
 *   - The Hybrid Search heading + the
 *     technical description (keyword +
 *     semantic + fusion + rerank) both
 *     render.
 *   - The visual is decorative
 *     (`aria-hidden` on the root).
 *   - The three columns (Keyword /
 *     Semantic / Fused) all render with
 *     their results, even before the
 *     scroll-triggered animation runs.
 *   - The fused column carries the
 *     "Fused + reranked" badge so the
 *     technical message is clear at a
 *     glance.
 *   - The visual is the marketing
 *     explanation of the actual Cortex
 *     retrieval architecture — not
 *     "AI magic".
 *
 * **Animation timing is NOT tested.**
 * The F8 spec is explicit: "You don't
 * need to unit-test every GSAP transform.
 * Test the state/output, not animation
 * implementation details." The final
 * state is what matters; the visitor must
 * see the merged stack once the section
 * has scrolled into view.
 */

import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { HybridSearchSection } from "@/components/marketing/features/hybrid-search"
import { HybridSearchVisual } from "@/components/marketing/features/hybrid-search-visual"

describe("HybridSearchSection", () => {
  it("renders the eyebrow", () => {
    render(<HybridSearchSection />)
    expect(screen.getByText(/^hybrid search$/i)).toBeInTheDocument()
  })

  it("renders the h2 with the marketing message", () => {
    render(<HybridSearchSection />)
    const h2 = screen.getByRole("heading", { level: 2 })
    // The heading is the
    // feature-section's heading.
    expect(h2).toHaveTextContent(/matches the words/i)
    expect(h2).toHaveTextContent(/matches the meaning/i)
  })

  it("the description mentions the four retrieval stages", () => {
    render(<HybridSearchSection />)
    // The architecture is the actual
    // Cortex stack (per the engineering
    // blueprint). The marketing copy
    // should reflect it — not "AI
    // magic".
    const section = screen.getByTestId("hybrid-search-text")
    // Each strong label is a unique
    // phrase (no overlap with the
    // heading or other text on the
    // page).
    expect(
      within(section).getByText("keyword search"),
    ).toBeInTheDocument()
    expect(
      within(section).getByText("vector similarity"),
    ).toBeInTheDocument()
    expect(
      within(section).getByText(/fuses the two result lists/i),
    ).toBeInTheDocument()
    expect(
      within(section).getByText(/reranks the candidates/i),
    ).toBeInTheDocument()
  })

  it("has a stable id for the marketing nav", () => {
    const { container } = render(<HybridSearchSection />)
    const section = container.querySelector("section#hybrid-search")
    expect(section).not.toBeNull()
  })

  it("renders the visual", () => {
    render(<HybridSearchSection />)
    const visual = screen.getByTestId("hybrid-search-visual")
    expect(visual).toBeInTheDocument()
    expect(visual).toHaveAttribute("aria-hidden", "true")
  })
})

describe("HybridSearchVisual", () => {
  it("renders all three columns (Keyword / Semantic / Fused)", () => {
    render(<HybridSearchVisual />)
    expect(screen.getByTestId("hybrid-search-column-keyword")).toBeInTheDocument()
    expect(screen.getByTestId("hybrid-search-column-semantic")).toBeInTheDocument()
    expect(screen.getByTestId("hybrid-search-column-fused")).toBeInTheDocument()
  })

  it("renders the Keyword results", () => {
    render(<HybridSearchVisual />)
    const column = screen.getByTestId("hybrid-search-column-keyword")
    expect(within(column).getByText("tenant_isolation.md")).toBeInTheDocument()
    expect(within(column).getByText("auth_refresh_body.md")).toBeInTheDocument()
    expect(within(column).getByText("audit_log.md")).toBeInTheDocument()
  })

  it("renders the Semantic results", () => {
    render(<HybridSearchVisual />)
    const column = screen.getByTestId("hybrid-search-column-semantic")
    expect(within(column).getByText("tenant_isolation.md")).toBeInTheDocument()
    expect(within(column).getByText("rls_policies.md")).toBeInTheDocument()
    expect(within(column).getByText("auth_refresh_body.md")).toBeInTheDocument()
  })

  it("renders the Fused + reranked stack with its badge", () => {
    render(<HybridSearchVisual />)
    const column = screen.getByTestId("hybrid-search-column-fused")
    // The "Fused + reranked" pill is the
    // visual's trust signal: this isn't
    // magic, this is the reranking step.
    expect(within(column).getByText(/fused \+ reranked/i)).toBeInTheDocument()
    // The post-fusion result set:
    expect(within(column).getByText("tenant_isolation.md")).toBeInTheDocument()
    expect(within(column).getByText("rls_policies.md")).toBeInTheDocument()
  })

  it("the final-state is understandable without the animation", () => {
    // The F8 spec is explicit:
    // "If the animation never runs, the
    // visitor must still understand Hybrid
    // Search." All three columns are in
    // the DOM from the first paint (they
    // start at opacity 0 and reveal
    // on scroll-in, but the markup is
    // there).
    render(<HybridSearchVisual />)
    expect(screen.getByTestId("hybrid-search-column-keyword")).toBeInTheDocument()
    expect(screen.getByTestId("hybrid-search-column-semantic")).toBeInTheDocument()
    expect(screen.getByTestId("hybrid-search-column-fused")).toBeInTheDocument()
    // The bottom label makes the "best
    // context" intent explicit even if
    // the visitor never sees the merge
    // animation.
    expect(screen.getByText(/reranked best context/i)).toBeInTheDocument()
  })

  it("the visual starts in the 'idle' state (data-revealed='false')", () => {
    render(<HybridSearchVisual />)
    // The columns start hidden; the
    // useInView hook flips data-revealed
    // to 'true' on scroll-in.
    const visual = screen.getByTestId("hybrid-search-visual")
    expect(visual).toHaveAttribute("data-revealed", "false")
  })
})
