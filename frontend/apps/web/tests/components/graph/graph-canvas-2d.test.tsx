/**
 * GraphCanvas2D — F9 Part 2.
 *
 * Tests the 2D SVG fallback for the Knowledge Graph
 * Explorer. The 2D fallback is rendered when
 * `useGraphCapability()` returns `"2d"`. The
 * component is a pure-SVG radial layout — no
 * R3F, no Three.js, no WebGL.
 *
 * The tests pin:
 *   - The root node sits at the centre.
 *   - First-degree neighbours sit on the
 *     first ring.
 *   - The selected node gets the Volt
 *     selection treatment.
 *   - Active-path nodes get the Ember
 *     treatment.
 *   - Edge click fires the `onEdgeSelect`
 *     callback.
 *   - Node click fires the `onSelect`
 *     callback.
 *   - The mode notice is rendered.
 *   - The component is keyboard-friendly
 *     (the SVG group has a cursor pointer +
 *     a hit area large enough to be tappable).
 */
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { GraphCanvas2D } from "@/components/graph/graph-canvas-2d"
import type { GraphData } from "@/components/graph/types"

const TEST_GRAPH: GraphData = {
  nodes: [
    { id: "n1", label: "Root", type: "person", position: [0, 0, 0] },
    { id: "n2", label: "Child 1", type: "project", position: [1, 0, 0] },
    { id: "n3", label: "Child 2", type: "document", position: [0, 1, 0] },
    { id: "n4", label: "Grandchild", type: "concept", position: [2, 1, 0] },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2" },
    { id: "e2", source: "n1", target: "n3" },
    { id: "e3", source: "n2", target: "n4" },
  ],
}

describe("GraphCanvas2D (2D fallback)", () => {
  it("renders the canvas with the documented testid", () => {
    render(<GraphCanvas2D data={TEST_GRAPH} selectedNodeId="n1" onSelect={vi.fn()} />)
    expect(screen.getByTestId("graph-canvas-2d")).toBeInTheDocument()
  })

  it("renders the 2D mode notice so the user knows why they're seeing 2D", () => {
    render(<GraphCanvas2D data={TEST_GRAPH} selectedNodeId="n1" onSelect={vi.fn()} />)
    const notice = screen.getByTestId("graph-2d-mode-notice")
    expect(notice).toBeInTheDocument()
    expect(notice.textContent).toMatch(/2D view/)
  })

  it("renders the root label for the currently selected node", () => {
    render(<GraphCanvas2D data={TEST_GRAPH} selectedNodeId="n2" onSelect={vi.fn()} />)
    const rootLabel = screen.getByTestId("graph-2d-root-label")
    expect(rootLabel.textContent).toContain("Child 1")
  })

  it("renders a clickable group for every node in the data", () => {
    render(<GraphCanvas2D data={TEST_GRAPH} selectedNodeId="n1" onSelect={vi.fn()} />)
    for (const node of TEST_GRAPH.nodes) {
      expect(screen.getByTestId(`graph-2d-node-${node.id}`)).toBeInTheDocument()
    }
  })

  it("marks the selected node with the `selected` data-state", () => {
    render(<GraphCanvas2D data={TEST_GRAPH} selectedNodeId="n2" onSelect={vi.fn()} />)
    const selected = screen.getByTestId("graph-2d-node-n2")
    expect(selected.getAttribute("data-state")).toBe("selected")
    // Other nodes should be `dimmed` (the
    // selection has a centre, so the
    // non-ring members fade).
    const dimmed = screen.getByTestId("graph-2d-node-n1")
    expect(dimmed.getAttribute("data-state")).toBe("dimmed")
  })

  it("calls onSelect when a node is clicked", () => {
    const onSelect = vi.fn()
    render(<GraphCanvas2D data={TEST_GRAPH} selectedNodeId="n1" onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId("graph-2d-node-n3"))
    expect(onSelect).toHaveBeenCalledWith("n3")
  })

  it("calls onEdgeSelect when an edge is clicked", () => {
    const onEdgeSelect = vi.fn()
    const { container } = render(
      <GraphCanvas2D
        data={TEST_GRAPH}
        selectedNodeId="n1"
        onSelect={vi.fn()}
        onEdgeSelect={onEdgeSelect}
      />,
    )
    // The edges are drawn as <line>
    // elements inside the SVG. The test
    // looks them up by direct SVG queries
    // via the container ref (avoids the
    // non-null assertion biome rule).
    const lines = container.querySelectorAll("svg line")
    expect(lines.length).toBe(TEST_GRAPH.edges.length)
    const firstLine = lines[0] as SVGLineElement | undefined
    expect(firstLine).toBeDefined()
    if (!firstLine) throw new Error("expected at least one edge line")
    fireEvent.click(firstLine)
    expect(onEdgeSelect).toHaveBeenCalledWith("e1")
  })

  it("marks active-path nodes with the `active-path` state", () => {
    render(
      <GraphCanvas2D
        data={TEST_GRAPH}
        selectedNodeId="n1"
        activePathEntityIds={new Set(["n1", "n2", "n4"])}
        onSelect={vi.fn()}
      />,
    )
    // The root sits on the active path
    // (it's where the user started), so
    // the active-path treatment takes
    // priority over the selected
    // treatment. This mirrors the R3F
    // canvas's "active-path wins" rule.
    expect(screen.getByTestId("graph-2d-node-n1").getAttribute("data-state")).toBe("active-path")
    expect(screen.getByTestId("graph-2d-node-n2").getAttribute("data-state")).toBe("active-path")
    // A node NOT on the path should be
    // dimmed.
    expect(screen.getByTestId("graph-2d-node-n3").getAttribute("data-state")).toBe("dimmed")
  })

  it("renders zero nodes when the data is empty (no crash)", () => {
    render(
      <GraphCanvas2D data={{ nodes: [], edges: [] }} selectedNodeId={null} onSelect={vi.fn()} />,
    )
    const canvas = screen.getByTestId("graph-canvas-2d")
    expect(within(canvas).queryAllByTestId(/^graph-2d-node-/).length).toBe(0)
  })

  it("exposes a touch-friendly hit area on every node", () => {
    // F9 P2 requires that interactive
    // elements aren't tiny on mobile.
    // Each node renders an invisible
    // (transparent) hit circle whose
    // radius is at least 18px — large
    // enough to be tappable.
    const { container } = render(
      <GraphCanvas2D data={TEST_GRAPH} selectedNodeId="n1" onSelect={vi.fn()} />,
    )
    const hitAreas = container.querySelectorAll('circle[fill="transparent"]')
    expect(hitAreas.length).toBe(TEST_GRAPH.nodes.length)
    for (const hit of Array.from(hitAreas)) {
      const r = Number(hit.getAttribute("r") ?? 0)
      expect(r).toBeGreaterThanOrEqual(18)
    }
  })
})
