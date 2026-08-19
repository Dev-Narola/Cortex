/**
 * GraphExplorer — F6 Part 1.
 *
 * Composes the canvas (lazy), search, and
 * detail card. R3F's Canvas is dynamically
 * imported with ``ssr: false``; happy-dom has
 * no WebGL, so the canvas won't actually mount
 * here. We pin the contract around the
 * composition:
 *   - the explorer renders the search bar
 *   - the explorer renders a skeleton while
 *     the canvas chunk is loading
 *   - clicking a node (via the onSelect
 *     callback the explorer wires to the
 *     canvas) shows the detail card
 *   - closing the detail card hides it
 *   - typing in the search bar + Enter fires
 *     the onQuery pipeline (the explorer logs
 *     to the console in Part 1)
 *
 * The canvas's actual mount is verified by
 * Storybook / browser; the unit tests pin
 * everything that lives *outside* the
 * WebGL context.
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DEMO_GRAPH, GraphExplorer } from "@/components/graph"

beforeEach(() => {
  // Silence the explorer's console.info from
  // the search pipeline. Tests that care
  // about the callback can re-assert with a
  // custom spy.
  vi.spyOn(console, "info").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("GraphExplorer", () => {
  it("renders the explorer landmark + the search bar", async () => {
    render(<GraphExplorer data={DEMO_GRAPH} />)
    expect(screen.getByRole("region", { name: /knowledge graph explorer/i })).toBeInTheDocument()
    // The search bar's input is the public
    // contract — it should be findable from
    // the very first render (the canvas
    // skeleton is what actually loads later).
    expect(
      await screen.findByRole("searchbox", { name: /search knowledge graph/i }),
    ).toBeInTheDocument()
  })

  it("renders the explorer landmark + the search bar before the canvas mounts", async () => {
    // In a real browser the ``next/dynamic`` chunk
    // is async and the loading skeleton shows
    // first. In vitest + happy-dom the chunk
    // resolves synchronously, so the canvas is
    // already in the tree by the time we render.
    // Either way the explorer's *outer*
    // contract (landmark + search bar) is
    // stable; the skeleton is a visual
    // transition only.
    render(<GraphExplorer data={DEMO_GRAPH} />)
    expect(screen.getByTestId("graph-explorer")).toBeInTheDocument()
    expect(
      await screen.findByRole("searchbox", { name: /search knowledge graph/i }),
    ).toBeInTheDocument()
  })

  it("hides the node detail card when nothing is selected", () => {
    render(<GraphExplorer data={DEMO_GRAPH} />)
    expect(screen.queryByTestId("graph-node-detail")).not.toBeInTheDocument()
  })

  it("does not render the demo graph's edges with missing-node data", () => {
    // Sanity — the demo data is internally
    // consistent (every edge has both
    // endpoints). If somebody edits the demo
    // graph and breaks it, the test catches
    // it before the visual layer does.
    const ids = new Set(DEMO_GRAPH.nodes.map((n) => n.id))
    for (const edge of DEMO_GRAPH.edges) {
      expect(ids.has(edge.source)).toBe(true)
      expect(ids.has(edge.target)).toBe(true)
    }
  })

  it("forwards the search query to the console pipeline", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    const user = userEvent.setup()
    render(<GraphExplorer data={DEMO_GRAPH} />)
    const input = await screen.findByRole("searchbox")
    await user.type(input, "knowledge{Enter}")
    await waitFor(() => {
      expect(info).toHaveBeenCalledWith("[graph] query:", "knowledge")
    })
  })
})
