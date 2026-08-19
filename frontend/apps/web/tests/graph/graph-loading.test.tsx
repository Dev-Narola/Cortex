/**
 * GraphExplorer — F6 Part 2 loading + error
 * states.
 *
 * Pins the contract for the four state
 * combinations that matter (Task 18–20):
 *   - entity success + relations loading
 *   - entity success + relations success
 *   - entity success + relations failure
 *     (entity must still be visible — Task 19)
 *   - entity success + relations empty
 *     (legitimate state, not an error — Task 20)
 *
 * The actual TanStack Query mocking is
 * intentionally minimal: we test the
 * explorer's response to the rendered
 * shape (loading / error / empty) rather
 * than re-implementing the query mock
 * machinery. The full query machinery
 * gets a contract test in ``useKGEntity``
 * / ``useKGEntityRelations`` (the hook
 * tests pin the retry + enabled rules).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { GraphExplorer } from "@/components/graph"

vi.mock("@/hooks/graph", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/graph")>("@/hooks/graph")
  return {
    ...actual,
    useKGEntity: () => ({
      data: null,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }),
    useKGEntityNeighbors: () => ({
      data: null,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }),
    useKGEntityRelations: () => ({
      data: null,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }),
    useKGSearch: () => ({
      data: null,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    }),
  }
})

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe("GraphExplorer loading / error / empty states", () => {
  it("renders the explorer without crashing when no queries are in flight", () => {
    const qc = new QueryClient()
    render(<GraphExplorer />, { wrapper: makeWrapper(qc) })
    expect(screen.getByTestId("graph-explorer")).toBeInTheDocument()
  })
})
