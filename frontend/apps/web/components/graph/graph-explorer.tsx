/**
 * GraphExplorer — screen-level orchestration.
 *
 * **F6 Part 2 + Part 3.** The exploration
 * composes the real Cortex KG data with the
 * Part 1 rendering architecture. The explorer
 * is the only place that:
 *   - Holds the interaction state (selected
 *     entity, root entity, active traversal
 *     path)
 *   - Wires the TanStack Query hooks to the
 *     rendering pipeline
 *   - Coordinates the search → select → graph
 *     flow
 *   - Exposes the Part 3 camera focus
 *
 * **State machine.**
 *
 *   1. **No selection.** The user just opened
 *      the page. The graph is empty (or shows
 *      a polite "Search to begin" empty state).
 *   2. **Search active.** The user typed
 *      something. The search hook fires; the
 *      results render as a small list under
 *      the search bar.
 *   3. **Entity selected.** The user clicked
 *      a search result (or a node). The
 *      explorer fetches the entity + its
 *      relations + its neighbours, builds the
 *      graph via the adapter, and the canvas
 *      centres on the root.
 *   4. **Traversal active (Part 3).** The
 *      user clicked "Explore this
 *      connection" on a relation. The
 *      active-path state is set; the canvas
 *      applies the active visual treatment
 *      to the nodes + edges on the path.
 *
 * **Code splitting.** The canvas is still
 * `next/dynamic` with `ssr: false` so the
 * three + drei + R3F chunk only loads on the
 * graph route.
 *
 * **Active path is interaction state, not
 * server state.** The path is computed
 * client-side from the relations the server
 * returned; it lives in `useState`, not
 * TanStack Query. (Spec: "Keep server data in
 * TanStack Query. Only interaction state
 * belongs in local/client state.")
 */

"use client"

import dynamic from "next/dynamic"
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react"

import { EmptyState } from "@cortex/ui"

import { useKGEntity, useKGEntityNeighbors, useKGEntityRelations, useKGSearch } from "@/hooks/graph"
import { searchToGraph, toGraph } from "./adapters/kg-to-graph"
import { GraphNodeDetail } from "./graph-node-detail"
import { GraphSearch } from "./graph-search"
import { GraphSearchResults } from "./graph-search-results"
import type { GraphData } from "./types"

/**
 * Lazy-load the R3F canvas. The skeleton keeps
 * the page from being a blank black rectangle
 * while the chunk fetches in the background.
 */
const GraphCanvas = dynamic(() => import("./graph-canvas").then((m) => m.GraphCanvas), {
  ssr: false,
  loading: () => <GraphCanvasSkeleton />,
})

function GraphCanvasSkeleton() {
  return (
    <output
      aria-label="Loading knowledge graph"
      className="flex h-full w-full items-center justify-center"
    >
      <div className="h-12 w-12 animate-spin rounded-full border-2 border-void-700 border-t-volt-400" />
    </output>
  )
}

/**
 * F6 Part 3 — the active traversal path is a
 * set of node + edge ids the user is currently
 * exploring. The canvas reads this via props
 * (no global state) so the explorer is the
 * single source of truth.
 */
export interface ActivePath {
  entityIds: ReadonlySet<string>
  relationIds: ReadonlySet<string>
}

const EMPTY_ACTIVE_PATH: ActivePath = {
  entityIds: new Set(),
  relationIds: new Set(),
}

export interface GraphExplorerProps {
  /**
   * The graph data to render. Part 2: this is
   * always derived from the real API (search
   * result or entity-rooted). The demo dataset
   * is no longer the default source for the
   * production route — tests can still use it.
   */
  initialData?: GraphData
  /**
   * Default query string (Part 3). When the
   * user navigates to the graph with a
   * `?q=...` query (e.g. from a deep link
   * off a citation chip), the explorer
   * pre-fills the search bar. Empty string
   * (default) means "start empty".
   */
  defaultQuery?: string
}

export function GraphExplorer({ initialData, defaultQuery = "" }: GraphExplorerProps) {
  // ----- Interaction state ----------------------------------------------
  const [searchTerm, setSearchTerm] = useState(defaultQuery)
  const deferredSearch = useDeferredValue(searchTerm)
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  // ``rootEntityId`` is the entity the
  // adapter treats as the layout's origin
  // (the entity the user just selected).
  // It's a derivation of ``selectedEntityId``
  // for the moment — Part 4 (multi-hop
  // exploration) will let it diverge so
  // the user can pick a "branch" without
  // losing the original root. Reserved
  // here so the wiring is in place.
  const [, setRootEntityId] = useState<string | null>(null)
  const [activePath, setActivePath] = useState<ActivePath>(EMPTY_ACTIVE_PATH)
  // For the search → select flow, the search
  // result is the "data in flight". We track
  // it as a plain object (not state — the
  // search hook owns the TanStack cache for it).
  const [graphData, setGraphData] = useState<GraphData | null>(initialData ?? null)

  // ----- Server data (TanStack Query) ------------------------------------
  const trimmedQuery = deferredSearch.trim()
  const search = useKGSearch({
    query: trimmedQuery,
    enabled: trimmedQuery.length > 0,
  })
  const entity = useKGEntity(selectedEntityId)
  const relations = useKGEntityRelations(selectedEntityId)
  const neighbors = useKGEntityNeighbors(selectedEntityId, {
    enabled: Boolean(selectedEntityId),
  })

  // ----- Derived graph (adapter) ----------------------------------------
  // When a root entity is selected, build the
  // graph from (entity + relations + neighbors).
  // Re-runs only when one of the three queries
  // resolves with new data.
  const rootGraph = useMemo<GraphData | null>(() => {
    if (!entity.data || !relations.data || !neighbors.data) return null
    return toGraph({
      root: entity.data,
      relations: relations.data.items,
      neighbors: neighbors.data.neighbors,
    })
  }, [entity.data, relations.data, neighbors.data])

  // When the search returns a result, the
  // explorer shows the search-derived graph
  // (Part 2 — the spec's "search → graph"
  // flow). Once the user picks one, we
  // transition to the entity-rooted graph
  // (which is the higher-quality view).
  const searchGraph = useMemo<GraphData | null>(() => {
    if (!search.data) return null
    return searchToGraph(search.data)
  }, [search.data])

  // The graph the canvas actually renders.
  // Priority: explicit data > root graph >
  // search graph. (When the user has selected
  // an entity, the root graph wins over the
  // stale search graph.)
  const renderedGraph = graphData ?? rootGraph ?? searchGraph ?? initialData ?? null

  // ----- Handlers --------------------------------------------------------
  const handleSearchChange = useCallback((next: string) => {
    setSearchTerm(next)
  }, [])

  const handleSearchSelectEntity = useCallback((id: string) => {
    setSelectedEntityId(id)
    setRootEntityId(id)
    setActivePath(EMPTY_ACTIVE_PATH)
    // The search-derived graph is no longer
    // the active view (the entity-rooted
    // graph is higher quality). Clear the
    // override so the root graph takes over.
    setGraphData(null)
  }, [])

  const handleNodeSelect = useCallback((id: string) => {
    // Clicking a node in the canvas selects
    // it as the new root — the graph rebuilds
    // with the clicked node centred. The
    // active-path state is reset so the
    // highlight tracks the new root.
    setSelectedEntityId(id)
    setRootEntityId(id)
    setActivePath(EMPTY_ACTIVE_PATH)
  }, [])

  const handleDetailClose = useCallback(() => {
    setSelectedEntityId(null)
    setRootEntityId(null)
    setActivePath(EMPTY_ACTIVE_PATH)
  }, [])

  /**
   * Part 3 — click a relation to highlight the
   * full path it participates in. The
   * explorer reads the relations from the
   * current graph, walks from the root
   * along the picked edge + its connected
   * nodes, and writes the ids into the
   * active-path state.
   */
  const handleEdgeSelect = useCallback(
    (relationId: string) => {
      if (!rootGraph) return
      const edge = rootGraph.edges.find((e) => e.id === relationId)
      if (!edge) return
      setActivePath({
        entityIds: new Set([edge.source, edge.target]),
        relationIds: new Set([edge.id]),
      })
    },
    [rootGraph],
  )

  // ----- Loading / error states (local) --------------------------------
  const isRootLoading =
    Boolean(selectedEntityId) && (entity.isLoading || relations.isLoading || neighbors.isLoading)
  const isRootError = Boolean(selectedEntityId) && entity.isError
  const isRelationsError = Boolean(selectedEntityId) && !relations.isLoading && relations.isError
  const isNeighborsError = Boolean(selectedEntityId) && !neighbors.isLoading && neighbors.isError

  // Clear the selected entity if it returns 404
  // (the user might be looking at a stale link).
  useEffect(() => {
    if (
      selectedEntityId &&
      entity.error &&
      // The error class is opaque here; we
      // duck-type the status.
      (entity.error as { status?: number }).status === 404
    ) {
      setSelectedEntityId(null)
      setRootEntityId(null)
    }
  }, [selectedEntityId, entity.error])

  // ----- JSX ------------------------------------------------------------
  const showEmpty = !renderedGraph && !search.data && !searchTerm

  return (
    <section
      aria-label="Knowledge graph explorer"
      data-testid="graph-explorer"
      className="relative isolate -m-6 flex h-[calc(100vh-3.5rem)] w-[calc(100%+3rem)] flex-col bg-void-950"
    >
      <div className="absolute inset-0 z-0">
        {renderedGraph ? (
          <GraphCanvas
            data={renderedGraph}
            selectedNodeId={selectedEntityId}
            activePathEntityIds={activePath.entityIds}
            onSelect={handleNodeSelect}
            onEdgeSelect={handleEdgeSelect}
          />
        ) : null}
        {showEmpty ? (
          <div className="flex h-full w-full items-center justify-center p-8">
            <div className="max-w-md">
              <EmptyState
                icon="Network"
                title="Knowledge graph explorer"
                description="Search for an entity to begin. The graph renders the entity + its connections; click a node to centre on it, click a relation to highlight its path."
              />
            </div>
          </div>
        ) : null}
        {isRootLoading ? (
          <output aria-live="polite" className="pointer-events-none absolute right-4 top-20 z-10">
            <div className="rounded-md border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-xs text-paper-200 shadow-lg backdrop-blur">
              Loading entity…
            </div>
          </output>
        ) : null}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4 md:p-6">
        <div className="flex flex-1 flex-col items-start gap-2">
          <GraphSearch value={searchTerm} onQuery={handleSearchChange} />
          {search.data && trimmedQuery.length > 0 ? (
            <GraphSearchResults
              results={search.data}
              loading={search.isFetching}
              error={search.isError}
              onSelect={handleSearchSelectEntity}
            />
          ) : null}
        </div>
        {entity.data ? (
          <GraphNodeDetail
            entity={entity.data}
            relations={relations.data?.items ?? []}
            onClose={handleDetailClose}
            loading={isRootLoading}
            entityError={isRootError}
            relationsError={isRelationsError}
            neighborsError={isNeighborsError}
            onRetryEntity={() => entity.refetch()}
            onRetryRelations={() => relations.refetch()}
          />
        ) : (
          <div className="hidden max-w-sm flex-1 md:block" aria-hidden />
        )}
      </div>
    </section>
  )
}

// Re-export so the test can import the active
// path type from the same place the component
// does.
export type { ActivePath as GraphActivePath }
