/**
 * The explorer opens on the whole-workspace graph (no search needed), and
 * explains the extraction delay when the workspace has no entities yet.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const overviewMock = vi.fn()
vi.mock("@/services/graph/kg", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/graph/kg")>()),
  getGraphOverview: (...args: unknown[]) => overviewMock(...args),
}))

import { GraphExplorer } from "@/components/graph"

function renderExplorer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <GraphExplorer />
    </QueryClientProvider>,
  )
}

describe("GraphExplorer overview", () => {
  beforeEach(() => overviewMock.mockReset())

  it("loads the workspace overview without a search", async () => {
    overviewMock.mockResolvedValue({
      query: "",
      entities: [
        {
          id: "e1",
          name: "Cortex",
          entity_type: "concept",
          description: "",
          canonical_id: null,
          source_chunk_id: null,
        },
        {
          id: "e2",
          name: "Postgres",
          entity_type: "technology",
          description: "",
          canonical_id: null,
          source_chunk_id: null,
        },
      ],
      relationships: [
        {
          id: "r1",
          source_entity_id: "e1",
          target_entity_id: "e2",
          relationship_type: "uses",
          confidence: 0.9,
          source_chunk_id: null,
        },
      ],
    })
    renderExplorer()
    await waitFor(() => expect(overviewMock).toHaveBeenCalled())
    expect(screen.queryByText("No entities yet")).not.toBeInTheDocument()
  })

  it("explains the background extraction when there are no entities", async () => {
    overviewMock.mockResolvedValue({ query: "", entities: [], relationships: [] })
    renderExplorer()
    expect(await screen.findByText("No entities yet")).toBeInTheDocument()
  })
})
