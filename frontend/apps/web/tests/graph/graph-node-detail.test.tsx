/**
 * GraphNodeDetail — F6 Part 1.
 *
 * Pure presentational card. Pins:
 *   - hidden when no node is selected
 *   - visible when a node is selected
 *   - shows the label, type, and id from the
 *     GraphNodeData
 *   - close button calls onClose
 *   - Escape key calls onClose
 *   - focus moves to the close button when
 *     the panel opens
 */

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { GraphNodeDetail } from "@/components/graph"
import type { GraphNode as GraphNodeData } from "@/components/graph/types"

const sampleNode: GraphNodeData = {
  id: "cortex",
  label: "Cortex",
  type: "system",
  position: [0, 0, 0],
}

describe("GraphNodeDetail", () => {
  it("renders nothing when no node is selected", () => {
    const { container } = render(<GraphNodeDetail node={null} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it("renders the node label, type, and id when a node is selected", () => {
    render(<GraphNodeDetail node={sampleNode} onClose={() => {}} />)
    expect(screen.getByTestId("graph-node-detail-name")).toHaveTextContent("Cortex")
    expect(screen.getByTestId("graph-node-detail-type")).toHaveTextContent("system")
    expect(screen.getByTestId("graph-node-detail-id")).toHaveTextContent("cortex")
  })

  it("uses the complementary landmark role so screen readers can find it", () => {
    render(<GraphNodeDetail node={sampleNode} onClose={() => {}} />)
    const panel = screen.getByRole("complementary")
    expect(panel).toHaveAttribute("aria-labelledby", "graph-node-detail-title")
  })

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn()
    render(<GraphNodeDetail node={sampleNode} onClose={onClose} />)
    const closeButton = screen.getByRole("button", { name: /close node detail/i })
    fireEvent.click(closeButton)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn()
    render(<GraphNodeDetail node={sampleNode} onClose={onClose} />)
    fireEvent.keyDown(window, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
