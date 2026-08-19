/**
 * GraphNodeDetail — the right-side detail card.
 *
 * **F6 Part 1.** Per the spec, the detail card
 * "slides in from the right on click". For Part 1
 * the slide is implemented as a conditional render
 * with a CSS transition (no Framer Motion
 * choreography yet — that's a polish task).
 *
 * **What it shows in Part 1.**
 *   - Entity name
 *   - Entity type
 *   - ID
 *
 * **What it shows in Part 2.** Source-document
 * references, related-entity list, the
 * provenance trail. The component's data shape
 * stays the same (``node`` is the input); the
 * adapter supplies a richer ``GraphNodeDetail``
 * object when the API lands.
 *
 * **Why conditional render instead of mount-
 * always-with-empty-state.** The spec describes
 * the panel as "appears on click" / "hidden
 * otherwise". A mounted-but-empty panel would
 * steal focus and add noise. Hidden when no
 * node is selected, the card is simply not in
 * the DOM — that's the cleanest Part 1 contract.
 *
 * **a11y.** The card is a ``role="complementary"``
 * landmark so screen readers can navigate to it
 * once it's visible. The close button is a
 * real ``<button>`` with an accessible name
 * ("Close node detail").
 */

"use client"

import { useEffect, useRef } from "react"

import { Button, Icon, type IconName } from "@cortex/ui"

import type { GraphNode } from "./types"

export interface GraphNodeDetailProps {
  /** The selected node, or null when nothing is
   *  selected (the panel is hidden in that case). */
  node: GraphNode | null
  /** Called when the user closes the detail. */
  onClose: () => void
}

/**
 * Map an entity-type string to a Lucide icon.
 * The mapping is intentionally narrow for Part 1
 * — the production version (Part 2) will read the
 * taxonomy from the API.
 */
function iconForType(type: string): IconName {
  switch (type) {
    case "capability":
      return "Workflow"
    case "data":
      return "Database"
    case "system":
      return "Box"
    default:
      return "Hexagon"
  }
}

export function GraphNodeDetail({ node, onClose }: GraphNodeDetailProps) {
  // Focus management — when the panel opens,
  // move focus to the close button so keyboard
  // users can dismiss it without hunting. The
  // Roving tabindex pattern would be over-
  // engineered for a single button.
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (node && closeButtonRef.current) {
      closeButtonRef.current.focus()
    }
  }, [node])

  // Escape closes the panel.
  useEffect(() => {
    if (!node) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [node, onClose])

  if (!node) return null

  const IconForType = iconForType(node.type)

  return (
    <aside
      aria-labelledby="graph-node-detail-title"
      data-testid="graph-node-detail"
      // The Slate surface matches the search
      // bar; the rounded + ring combination
      // marks it as a "card" without a heavy
      // shadow. The slide-in is a single
      // translate; the duration is short so
      // the panel doesn't feel laggy.
      className="pointer-events-auto w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800/90 p-4 text-paper-50 shadow-xl backdrop-blur-md ring-1 ring-void-950/40 transition-transform duration-200 ease-out data-[state=open]:translate-x-0 translate-x-0"
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-volt-500/10 text-volt-400"
          >
            <Icon name={IconForType} size="md" tone="accent" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="graph-node-detail-title"
              className="font-display text-base font-semibold leading-tight tracking-tight text-paper-50"
              data-testid="graph-node-detail-name"
            >
              {node.label}
            </h2>
            <p className="mt-0.5 text-xs text-paper-200/70">
              <span className="sr-only">Type:</span>
              <span data-testid="graph-node-detail-type">{node.type}</span>
            </p>
          </div>
        </div>
        <Button
          ref={closeButtonRef}
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Close node detail"
          className="text-paper-200 hover:bg-slate-700/50 hover:text-paper-50"
        >
          <Icon name="X" size="sm" />
        </Button>
      </header>

      <dl className="space-y-2 text-xs">
        <div>
          <dt className="font-medium uppercase tracking-wider text-paper-200/50">ID</dt>
          <dd
            className="mt-1 break-all font-mono text-[11px] text-paper-200"
            data-testid="graph-node-detail-id"
          >
            {node.id}
          </dd>
        </div>
        <div>
          <dt className="font-medium uppercase tracking-wider text-paper-200/50">Position</dt>
          <dd className="mt-1 font-mono text-[11px] text-paper-200">
            [{node.position.map((n) => n.toFixed(2)).join(", ")}]
          </dd>
        </div>
      </dl>

      {/* Part 2 will add: source documents,
          related entities, provenance trail.
          The empty space below is intentional —
          it gives the panel room to grow without
          a layout shift. */}
    </aside>
  )
}
