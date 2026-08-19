/**
 * GraphNodeDetail — F6 Part 2 + Part 3.
 *
 * The card now consumes the real ``KGEntity``
 * (not the rendering-only ``GraphNode``).
 * Tests pin:
 *   - hidden when no entity is selected
 *   - shows the entity's name + type + id
 *   - shows the description when present
 *   - shows the canonical_id when present
 *   - shows the source_chunk_id when present
 *   - lists relations with their types +
 *     confidence
 *   - "No connected relationships found"
 *     when relations is empty (Task 20)
 *   - "Relations unavailable + Retry" when the
 *     relations query errored (Task 19)
 *   - close button calls onClose
 *   - Escape key calls onClose
 */

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { GraphNodeDetail } from "@/components/graph"
import type { KGEntity, KGRelationship } from "@/types/kg"

const sampleEntity: KGEntity = {
  id: "cortex",
  tenant_id: "t1",
  name: "Cortex",
  entity_type: "system",
  description: "An AI platform.",
  properties: {},
  canonical_id: null,
  source_chunk_id: null,
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
}

const sampleRelations: KGRelationship[] = [
  {
    id: "r1",
    tenant_id: "t1",
    source_entity_id: "cortex",
    target_entity_id: "search",
    relationship_type: "uses",
    confidence: 0.92,
    properties: {},
    source_chunk_id: "c1",
    created_at: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "r2",
    tenant_id: "t1",
    source_entity_id: "docs",
    target_entity_id: "cortex",
    relationship_type: "mentions",
    confidence: 0.74,
    properties: {},
    source_chunk_id: "c2",
    created_at: "2025-01-01T00:00:00.000Z",
  },
]

describe("GraphNodeDetail", () => {
  it("renders nothing when no entity is selected", () => {
    const { container } = render(
      <GraphNodeDetail entity={null} relations={[]} onClose={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders the entity name + type + id when an entity is selected", () => {
    render(<GraphNodeDetail entity={sampleEntity} relations={[]} onClose={() => {}} />)
    expect(screen.getByTestId("graph-node-detail-name")).toHaveTextContent("Cortex")
    expect(screen.getByTestId("graph-node-detail-type")).toHaveTextContent("system")
    expect(screen.getByTestId("graph-node-detail-id")).toHaveTextContent("cortex")
  })

  it("shows the description when the entity has one", () => {
    render(<GraphNodeDetail entity={sampleEntity} relations={[]} onClose={() => {}} />)
    expect(screen.getByTestId("graph-node-detail-description")).toHaveTextContent("An AI platform.")
  })

  it("shows the canonical id when the entity is a duplicate", () => {
    render(
      <GraphNodeDetail
        entity={{ ...sampleEntity, canonical_id: "primary-entity-id" }}
        relations={[]}
        onClose={() => {}}
      />,
    )
    expect(screen.getByTestId("graph-node-detail-canonical")).toHaveTextContent("primary-entity-id")
  })

  it("shows the source chunk id when the entity has one", () => {
    render(
      <GraphNodeDetail
        entity={{ ...sampleEntity, source_chunk_id: "chunk-1" }}
        relations={[]}
        onClose={() => {}}
      />,
    )
    expect(screen.getByTestId("graph-node-detail-source-chunk")).toHaveTextContent("chunk-1")
  })

  it("lists relations with type + confidence", () => {
    render(<GraphNodeDetail entity={sampleEntity} relations={sampleRelations} onClose={() => {}} />)
    expect(screen.getByTestId("graph-relation-r1")).toBeInTheDocument()
    expect(screen.getByTestId("graph-relation-r2")).toBeInTheDocument()
    expect(screen.getByText("uses")).toBeInTheDocument()
    expect(screen.getByText("92.0%")).toBeInTheDocument()
    expect(screen.getByText("mentions")).toBeInTheDocument()
    expect(screen.getByText("74.0%")).toBeInTheDocument()
  })

  it("shows the empty state when relations is empty (Task 20)", () => {
    render(<GraphNodeDetail entity={sampleEntity} relations={[]} onClose={() => {}} />)
    expect(screen.getByText(/no connected relationships found/i)).toBeInTheDocument()
  })

  it("shows a Relations-unavailable + Retry when the relations query errored (Task 19)", () => {
    const onRetryRelations = vi.fn()
    render(
      <GraphNodeDetail
        entity={sampleEntity}
        relations={[]}
        onClose={() => {}}
        relationsError
        onRetryRelations={onRetryRelations}
      />,
    )
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent(/relations unavailable/i)
    const retry = screen.getByRole("button", { name: /retry/i })
    fireEvent.click(retry)
    expect(onRetryRelations).toHaveBeenCalled()
  })

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn()
    render(<GraphNodeDetail entity={sampleEntity} relations={[]} onClose={onClose} />)
    fireEvent.click(screen.getByRole("button", { name: /close node detail/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn()
    render(<GraphNodeDetail entity={sampleEntity} relations={[]} onClose={onClose} />)
    fireEvent.keyDown(window, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
