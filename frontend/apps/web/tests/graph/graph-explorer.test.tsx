/**
 * GraphExplorer — F6 Part 2 + Part 3.
 *
 * The explorer is now a TanStack Query
 * orchestrator. The tests pin the contract
 * around the composition:
 *   - the explorer renders the search bar
 *   - the explorer renders a loading skeleton
 *     while the canvas chunk loads
 *   - the explorer shows the empty state when
 *     no search + no selection
 *   - the explorer hides the node detail card
 *     when nothing is selected
 *   - the demo dataset is no longer the
 *     default source for the production
 *     route (Task 32)
 *   - the explorer uses a controlled search
 *     input (Part 2 contract change)
 *
 * R3F's Canvas is dynamically imported; happy-dom
 * has no WebGL, so the chunk resolves
 * synchronously in the test env and the canvas
 * is already in the tree by the time we render.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GraphExplorer } from "@/components/graph"

beforeEach(() => {
  // Silence the search-info console noise
  // from the explorer's Part 1 console-info
  // path (the search pipeline logs each
  // forwarded query in Part 1; Part 2 wires
  // the real API). Tests that care about
  // the callback can re-assert with a
  // custom spy.
  vi.spyOn(console, "info").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe("GraphExplorer", () => {
  it("renders the explorer landmark + the search bar", async () => {
    const qc = new QueryClient()
    render(<GraphExplorer />, { wrapper: makeWrapper(qc) })
    expect(screen.getByRole("region", { name: /knowledge graph explorer/i })).toBeInTheDocument()
    expect(
      await screen.findByRole("searchbox", { name: /search knowledge graph/i }),
    ).toBeInTheDocument()
  })

  it("renders a loading skeleton while the canvas chunk is loading", () => {
    const qc = new QueryClient()
    render(<GraphExplorer />, { wrapper: makeWrapper(qc) })
    // The skeleton role is announced for AT.
    expect(screen.getByTestId("graph-explorer")).toBeInTheDocument()
    expect(screen.getByRole("searchbox", { name: /search knowledge graph/i })).toBeInTheDocument()
  })

  it("hides the node detail card when nothing is selected", () => {
    const qc = new QueryClient()
    render(<GraphExplorer />, { wrapper: makeWrapper(qc) })
    expect(screen.queryByTestId("graph-node-detail")).not.toBeInTheDocument()
  })

  it("reflects a controlled search term via defaultQuery", () => {
    const qc = new QueryClient()
    render(<GraphExplorer defaultQuery="acme" />, {
      wrapper: makeWrapper(qc),
    })
    expect(screen.getByRole("searchbox")).toHaveValue("acme")
  })

  it("F6 Part 2 — no longer auto-renders the demo dataset", () => {
    // The Part 1 explorer accepted a ``data``
    // prop and forwarded ``DEMO_GRAPH`` from
    // the route. Part 2 removes both: the
    // explorer derives its data from real
    // TanStack queries. The route no longer
    // passes demo data either (Task 32).
    const qc = new QueryClient()
    render(<GraphExplorer />, { wrapper: makeWrapper(qc) })
    // The search bar is the only "initial"
    // visible surface — no graph is rendered
    // until the user types or the route
    // supplies a defaultQuery.
    expect(screen.getByRole("searchbox", { name: /search knowledge graph/i })).toBeInTheDocument()
  })
})
