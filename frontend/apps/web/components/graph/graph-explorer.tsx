/**
 * GraphExplorer — the screen-level composition.
 *
 * **F6 Part 1.** Composes the four pieces of
 * the graph screen:
 *
 *   - ``GraphCanvas``   — the R3F scene (lazy)
 *   - ``GraphSearch``   — the floating search bar
 *   - ``GraphNodeDetail`` — the right-side card
 *   - (empty / error)   — surface for Part 1
 *
 * **Why this is the only ``"use client"``
 * boundary in the directory.** The Canvas
 * is heavy + R3F is client-only; the search
 * bar and detail card are pure presentational
 * shells but they need the explorer's
 * selection state. Putting the boundary here
 * keeps the Canvas (and its 600 KB of three
 * + drei) inside a single lazy chunk that
 * only loads on the graph route.
 *
 * **Code splitting.** The Canvas import is
 * ``next/dynamic`` with ``ssr: false``. The
 * default export of ``graph-canvas.tsx``
 * only ships in the graph route's chunk —
 * the rest of the application pays nothing.
 *
 * **Selection state.** The explorer owns the
 * currently-selected node id. The Canvas
 * reads it (to dim un-focused nodes) and the
 * detail card reads it (to show the selected
 * node). Clicking a node, or clicking the
 * detail's close button, updates the state.
 *
 * **Search state.** The search input fires
 * ``onQuery`` on Enter / Esc / clear. The
 * explorer forwards the query to a console
 * log for Part 1; Part 2 wires it to the API
 * adapter.
 */

"use client"

import dynamic from "next/dynamic"
import { useCallback, useState } from "react"

import { GraphNodeDetail } from "./graph-node-detail"
import { GraphSearch } from "./graph-search"
import type { GraphData } from "./types"

/**
 * Lazy-load the R3F canvas.
 *
 *   - ``ssr: false`` — R3F can't render on the
 *     server (it needs WebGL / ``window``).
 *   - ``loading: () => <GraphCanvasSkeleton />``
 *     — the canvas mount is async (the
 *     next/dynamic chunk fetches in the
 *     background). While it loads we show a
 *     skeleton so the page isn't a blank black
 *     rectangle.
 *
 * The skeleton is intentionally simple — a
 * pulsing ring that matches the Void palette
 * so the page doesn't look broken mid-load.
 */
const GraphCanvas = dynamic(() => import("./graph-canvas").then((m) => m.GraphCanvas), {
  ssr: false,
  loading: () => <GraphCanvasSkeleton />,
})

/**
 * Pulse placeholder for the canvas. Renders a
 * single spinning ring on the Void surface so
 * the user knows the page is loading rather
 * than broken.
 */
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

export interface GraphExplorerProps {
  /** The graph data to render. The Part 1
   *  source is the demo dataset; Part 2 will
   *  pass the API-adapter output. */
  data: GraphData
}

export function GraphExplorer({ data }: GraphExplorerProps) {
  // Selection — the single piece of state
  // the explorer owns. The Canvas dims every
  // other node when something is selected;
  // the detail card renders the picked node.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const handleSelect = useCallback((id: string) => {
    setSelectedNodeId(id)
  }, [])

  const handleClose = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  // Search — Part 1 logs the query so the
  // contract is observable. Part 2 wires
  // this to the real API adapter.
  const handleQuery = useCallback((query: string) => {
    // eslint-disable-next-line no-console -- dev-only surface
    console.info("[graph] query:", query)
  }, [])

  // Find the selected node object for the
  // detail card. We do this on every render;
  // the list is small (< 100 nodes for any
  // realistic graph) so a linear scan is fine.
  const selectedNode = selectedNodeId
    ? (data.nodes.find((n) => n.id === selectedNodeId) ?? null)
    : null

  return (
    // Full-bleed — the explorer escapes the
    // (app) layout's ``p-6`` padding via
    // negative margins so the canvas reaches
    // every pixel the layout is willing to
    // give it. The route (``page.tsx``) adds
    // ``-m-6`` to the same effect; we do
    // both so the explorer is correct
    // regardless of how the route wraps it.
    <section
      aria-label="Knowledge graph explorer"
      data-testid="graph-explorer"
      className="relative isolate -m-6 flex h-[calc(100vh-3.5rem)] w-[calc(100%+3rem)] flex-col bg-void-950"
    >
      {/* The canvas fills the entire section. */}
      <div className="absolute inset-0 z-0">
        <GraphCanvas data={data} selectedNodeId={selectedNodeId} onSelect={handleSelect} />
      </div>

      {/* Floating overlays — search top-left,
          detail top-right. Both are above the
          canvas (``z-10``) but the canvas
          stays interactive (the floats have
          ``pointer-events-none`` on the
          container + ``auto`` on the inner
          surfaces). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4 md:p-6">
        <div className="flex flex-1 items-start">
          <GraphSearch onQuery={handleQuery} />
        </div>
        {selectedNode ? (
          <GraphNodeDetail node={selectedNode} onClose={handleClose} />
        ) : (
          // Reserve the same width on the right
          // so the search bar doesn't jump when
          // a node is selected. The empty slot is
          // a non-interactive placeholder.
          <div className="hidden max-w-sm flex-1 md:block" aria-hidden />
        )}
      </div>
    </section>
  )
}
