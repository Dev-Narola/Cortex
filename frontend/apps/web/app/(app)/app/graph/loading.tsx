/**
 * Knowledge Graph — loading boundary.
 *
 * **F6 Part 1.** Renders while the route
 * segment is loading (server fetch in flight,
 * or the client chunk for the explorer is
 * still being parsed). The skeleton matches
 * the explorer's eventual layout so the
 * transition into the real graph is
 * smooth — same dark Void surface, same
 * floating search bar position, same canvas
 * slot.
 *
 * **Why a tailored skeleton instead of a
 * generic spinner.** The spec calls for every
 * new screen to have a meaningful loading
 * state. The graph's "loading" looks like
 * "the canvas is about to appear" — a single
 * spinner in the middle of the screen would
 * feel like the route was broken, not in
 * progress.
 */

import { Icon } from "@cortex/ui"

export default function GraphLoading() {
  return (
    <section
      aria-busy
      aria-label="Loading knowledge graph"
      className="relative -m-6 flex h-[calc(100vh-3.5rem)] w-[calc(100%+3rem)] flex-col bg-void-950"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4 md:p-6">
        {/* Search bar placeholder — same shape
            as the real bar so the layout doesn't
            shift when the real one mounts. */}
        <div className="flex flex-1 items-start">
          <output className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-slate-600 bg-slate-700/60 px-3 text-sm text-paper-200/50 backdrop-blur-sm">
            <Icon name="Search" size="sm" tone="muted" aria-hidden />
            <span>Loading knowledge graph…</span>
          </output>
        </div>
      </div>

      <output className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-paper-200/60">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-void-700 border-t-volt-400" />
          <p className="text-sm">Preparing the 3D scene</p>
        </div>
      </output>
    </section>
  )
}
