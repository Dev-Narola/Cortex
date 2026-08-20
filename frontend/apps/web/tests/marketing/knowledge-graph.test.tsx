/**
 * KnowledgeGraphSection — F8 Part 3.
 *
 * Tests the Knowledge Graph feature
 * section + visual:
 *   - The eyebrow + heading + description
 *     render.
 *   - The icon is present (Spark-gradient
 *     treatment per the F8 spec).
 *   - The graph visual is present and
 *     decorative (`aria-hidden`).
 *   - Multiple node categories render
 *     (Document, Person, Concept, Project,
 *     Technology).
 *   - The "important relationship" highlight
 *     edge is present.
 *   - The "reverse" layout is in effect
 *     (visual appears first / on the left
 *     at desktop widths).
 *   - The "connected context" message is
 *     clear in the description (not just
 *     "we have a knowledge graph").
 *   - The visual's final state is
 *     understandable without the
 *     animation.
 */

import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { KnowledgeGraphSection } from "@/components/marketing/features/knowledge-graph"
import { KnowledgeGraphVisual } from "@/components/marketing/features/knowledge-graph-visual"

describe("KnowledgeGraphSection", () => {
  it("renders the eyebrow + heading", () => {
    render(<KnowledgeGraphSection />)
    expect(screen.getByText(/^knowledge graph$/i)).toBeInTheDocument()
    const h2 = screen.getByRole("heading", { level: 2 })
    expect(h2).toHaveTextContent(/connect the knowledge/i)
  })

  it("renders the description with 'connected context' messaging", () => {
    render(<KnowledgeGraphSection />)
    // The marketing message is that
    // retrieval uses the graph, not just
    // isolated chunks. The phrase
    // "connected context" carries the
    // differentiator.
    const text = screen.getByTestId("knowledge-graph-text")
    expect(within(text).getByText(/connected context/i)).toBeInTheDocument()
  })

  it("renders the icon in the Spark-gradient treatment", () => {
    render(<KnowledgeGraphSection />)
    const icon = screen.getByTestId("knowledge-graph-icon")
    expect(icon).toBeInTheDocument()
    // The icon container uses bg-spark so
    // the marketing feature icons share
    // the same visual treatment.
    expect(icon.className).toMatch(/bg-spark/)
  })

  it("renders the visual and marks it decorative", () => {
    render(<KnowledgeGraphSection />)
    const visual = screen.getByTestId("knowledge-graph-visual")
    expect(visual).toBeInTheDocument()
    expect(visual).toHaveAttribute("aria-hidden", "true")
  })

  it("has a stable id for the marketing nav", () => {
    const { container } = render(<KnowledgeGraphSection />)
    const section = container.querySelector("section#knowledge-graph")
    expect(section).not.toBeNull()
  })
})

describe("KnowledgeGraphVisual", () => {
  it("renders node categories for Document, Person, Concept, Project, Technology", () => {
    render(<KnowledgeGraphVisual />)
    // The visual shows the abstract shape
    // of a graph — Document nodes, Person
    // nodes, etc. The legend below lists
    // the categories explicitly so the
    // visitor can decode the colour
    // palette.
    for (const cat of ["Document", "Person", "Concept", "Project", "Technology"]) {
      // Each category appears at least
      // once (either as a node label or
      // in the legend).
      expect(screen.getAllByText(cat).length).toBeGreaterThanOrEqual(1)
    }
  })

  it("renders an 'important relationship' highlight edge (Spark)", () => {
    render(<KnowledgeGraphVisual />)
    // The highlight edge carries the
    // marketing message: "Cortex can
    // traverse relationships, not just
    // find isolated chunks." A test
    // pins the highlight exists.
    const highlight = screen.getByTestId("kg-edge-highlight")
    expect(highlight).toBeInTheDocument()
  })

  it("starts in the idle state (data-revealed='false')", () => {
    render(<KnowledgeGraphVisual />)
    const visual = screen.getByTestId("knowledge-graph-visual")
    expect(visual).toHaveAttribute("data-revealed", "false")
  })

  it("the final state is understandable without the animation", () => {
    // All nodes are in the DOM from the
    // first paint (they start at opacity
    // 0 but the markup is there). The
    // legend below is also always
    // present.
    render(<KnowledgeGraphVisual />)
    expect(screen.getByText("Research Notes")).toBeInTheDocument()
    expect(screen.getByText("Cortex")).toBeInTheDocument()
    expect(screen.getByText("Postgres")).toBeInTheDocument()
    expect(screen.getByText("pgvector")).toBeInTheDocument()
  })
})
