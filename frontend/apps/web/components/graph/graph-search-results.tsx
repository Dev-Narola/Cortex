/**
 * GraphSearchResults — the floating result list
 * under the search bar.
 *
 * **F6 Part 2 (Task 13).** Renders the entities
 * returned by ``useKGSearch``. The user clicks
 * one to load that entity as the graph's root.
 *
 * **Why a separate component.** The result
 * list is its own UI surface (it's a dropdown,
 * not a graph overlay). Splitting it out keeps
 * the explorer's JSX focused on the
 * screen-level composition.
 *
 * **Result count.** The backend caps search at
 * 200 hits; the list shows up to 8 before
 * scrolling. Beyond that the user refines
 * their query.
 */

"use client"

import type { ReactNode } from "react"

import { Icon } from "@cortex/ui"

import type { KGSearchResponse } from "@/types/kg"

export interface GraphSearchResultsProps {
  results: KGSearchResponse
  loading: boolean
  error: boolean
  onSelect: (id: string) => void
}

export function GraphSearchResults({
  results,
  loading,
  error,
  onSelect,
}: GraphSearchResultsProps): ReactNode {
  if (error) {
    return (
      <div
        role="alert"
        className="pointer-events-auto w-full max-w-sm rounded-md border border-destructive/40 bg-slate-800/90 p-3 text-xs text-destructive shadow-lg backdrop-blur"
      >
        Couldn&apos;t search the knowledge graph.
      </div>
    )
  }
  const items = results.entities.slice(0, 8)
  if (items.length === 0 && !loading) {
    return (
      <output className="pointer-events-auto w-full max-w-sm rounded-md border border-slate-700 bg-slate-800/90 p-3 text-xs text-paper-200 shadow-lg backdrop-blur">
        No matching entity found.
      </output>
    )
  }
  return (
    <ul
      aria-label="Search results"
      data-testid="graph-search-results"
      className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-md border border-slate-700 bg-slate-800/95 shadow-lg backdrop-blur"
    >
      {items.map((entity) => (
        <li key={entity.id}>
          <button
            type="button"
            onClick={() => onSelect(entity.id)}
            data-testid={`graph-search-result-${entity.id}`}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-paper-50 transition-colors hover:bg-slate-700/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500"
          >
            <Icon name="Network" size="sm" tone="muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{entity.name}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-paper-200/50">
              {entity.entity_type}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
