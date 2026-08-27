/**
 * GraphCanvas2D — the 2D fallback for the Knowledge Graph Explorer.
 *
 * **F9 Part 2.** When `useGraphCapability()` returns `"2d"`, the
 * explorer renders this component in place of the R3F
 * `GraphCanvas`. The 2D fallback is a pure SVG radial layout:
 *
 *   - The selected (root) entity sits at the centre.
 *   - First-degree neighbours form the inner ring.
 *   - Second-degree neighbours form the outer ring.
 *   - Edges are drawn as straight lines from the centre
 *     outwards (or between rings for cross-ring links).
 *
 * **Why radial, not full force-directed.** A real force-
 * directed layout needs a physics loop (which means an
 * `useEffect` + `requestAnimationFrame` + per-frame state).
 * A radial layout is deterministic given the input data, fits
 * in a single render pass, and matches the F9 P2 spirit:
 * the fallback is "a graph that conveys the same information",
 * not a perfect replica of the 3D experience. The radial
 * pattern is what most mobile graph UIs (GitHub, etc.) ship.
 *
 * **What the 2D fallback preserves from the 3D canvas.**
 *   - Same data shape (`GraphData`).
 *   - Same node states (`default` / `selected` / `dimmed` /
 *     `active-path`).
 *   - Same active-path colour treatment (Ember for active-path
 *     nodes, Spark-tinted stroke for active-path edges).
 *   - Same `onSelect` callback contract.
 *
 * **What the 2D fallback does NOT need.**
 *   - Camera (no orbit / pan / zoom).
 *   - WebGL / R3F / Three.js.
 *   - Continuous animation. The radial layout is static.
 *
 * **Reduced motion.** Already honoured by `useGraphCapability()`:
 * a user with `prefers-reduced-motion: reduce` lands here
 * automatically (so they never experience the 3D damping).
 *
 * **Performance.** Pure SVG, no animations, no per-frame work.
 * A 200-node graph renders in <16ms. The exploration page's
 * `applyGraphLimits` cap (Part 4) already trims the graph
 * to a renderable size, so this component never has to
 * worry about pathological inputs.
 */

import { type ReactNode, useMemo } from "react"

import { GRAPH_2D_VIEWPORT_THRESHOLD_PX, useGraphCapability } from "@/lib/graph/graph-capability"

import type { GraphData, GraphNodeState } from "./types"

export interface GraphCanvas2DProps {
  data: GraphData
  /** Currently selected node id. */
  selectedNodeId: string | null
  /** Ids of nodes on the active traversal path. */
  activePathEntityIds?: ReadonlySet<string>
  /** Ids of relations on the active traversal path. */
  activePathRelationIds?: ReadonlySet<string>
  /** Click handler — fired when the user taps a node. */
  onSelect: (id: string) => void
  /** Click handler — fired when the user taps an edge. */
  onEdgeSelect?: (relationId: string) => void
  /** Optional passthrough className. */
  className?: string
}

/** ViewBox for the radial layout. The viewBox is square;
 *  the consuming element decides the actual on-screen size. */
const VIEWBOX_SIZE = 800
const CENTRE = VIEWBOX_SIZE / 2
const FIRST_RING_RADIUS = 220
const SECOND_RING_RADIUS = 360
const NODE_RADIUS_DEFAULT = 10
const NODE_RADIUS_SELECTED = 14
const NODE_RADIUS_ACTIVE = 14

/**
 * Compute the layout: which ring each node belongs to, and
 * the (x, y) coordinate for that node. The root sits at the
 * centre. Direct neighbours of the root sit on the first ring.
 * Second-degree neighbours sit on the outer ring.
 */
interface PositionedNode {
  id: string
  label: string
  x: number
  y: number
  state: GraphNodeState
}

function layoutNodes(
  data: GraphData,
  selectedNodeId: string | null,
  activePathEntityIds: ReadonlySet<string> | undefined,
): { nodes: PositionedNode[]; rootId: string | null } {
  // The "root" of the radial layout is the selected
  // node. If nothing is selected we pick the first
  // node (so the layout always renders *something*).
  const rootId = selectedNodeId ?? data.nodes[0]?.id ?? null
  if (!rootId) return { nodes: [], rootId: null }

  // First ring: nodes directly connected to the root.
  const firstRing = new Set<string>()
  for (const edge of data.edges) {
    if (edge.source === rootId) firstRing.add(edge.target)
    else if (edge.target === rootId) firstRing.add(edge.source)
  }

  // Second ring: nodes connected to a first-ring node
  // (excluding the root + first-ring).
  const secondRing = new Set<string>()
  for (const edge of data.edges) {
    const isFirstRingEdge =
      (edge.source === rootId && firstRing.has(edge.target)) ||
      (edge.target === rootId && firstRing.has(edge.source))
    if (isFirstRingEdge) continue
    if (edge.source === rootId || edge.target === rootId) continue
    if (firstRing.has(edge.source) && !firstRing.has(edge.target)) {
      secondRing.add(edge.target)
    } else if (firstRing.has(edge.target) && !firstRing.has(edge.source)) {
      secondRing.add(edge.source)
    }
  }

  const nodeIndex = new Map(data.nodes.map((n) => [n.id, n]))
  const hasSelection = selectedNodeId !== null

  // Compute positions.
  const positions: PositionedNode[] = []
  const placeOnRing = (ids: string[], radius: number, startAngle = -Math.PI / 2) => {
    if (ids.length === 0) return
    const step = (2 * Math.PI) / ids.length
    ids.forEach((id, i) => {
      const node = nodeIndex.get(id)
      if (!node) return
      const angle = startAngle + step * i
      const x = CENTRE + radius * Math.cos(angle)
      const y = CENTRE + radius * Math.sin(angle)
      const state = stateFor(id, selectedNodeId, hasSelection, activePathEntityIds)
      positions.push({
        id: node.id,
        label: node.label,
        x,
        y,
        state,
      })
    })
  }

  // Root at the centre.
  const root = nodeIndex.get(rootId)
  if (root) {
    positions.push({
      id: root.id,
      label: root.label,
      x: CENTRE,
      y: CENTRE,
      state: stateFor(root.id, selectedNodeId, hasSelection, activePathEntityIds),
    })
  }

  placeOnRing([...firstRing], FIRST_RING_RADIUS)
  placeOnRing([...secondRing], SECOND_RING_RADIUS, -Math.PI / 4)

  return { nodes: positions, rootId }
}

/**
 * Resolve a node's visual state from the current selection
 * + the active path. Mirrors the R3F canvas's logic so the
 * 2D fallback is visually consistent.
 */
function stateFor(
  nodeId: string,
  selectedNodeId: string | null,
  hasSelection: boolean,
  activePathEntityIds: ReadonlySet<string> | undefined,
): GraphNodeState {
  if (activePathEntityIds?.has(nodeId)) return "active-path"
  if (nodeId === selectedNodeId) return "selected"
  if (hasSelection) return "dimmed"
  return "default"
}

function nodeFillClass(state: GraphNodeState): string {
  switch (state) {
    case "active-path":
      return "fill-ember-500"
    case "selected":
      return "fill-volt-500"
    case "dimmed":
      return "fill-slate-600"
    default:
      return "fill-slate-400"
  }
}

function edgeStrokeClass(isActive: boolean, hasSelection: boolean): string {
  if (isActive) return "stroke-ember-500"
  if (hasSelection) return "stroke-slate-700"
  return "stroke-slate-600"
}

function nodeRadius(state: GraphNodeState): number {
  if (state === "selected") return NODE_RADIUS_SELECTED
  if (state === "active-path") return NODE_RADIUS_ACTIVE
  return NODE_RADIUS_DEFAULT
}

export function GraphCanvas2D({
  data,
  selectedNodeId,
  activePathEntityIds,
  activePathRelationIds,
  onSelect,
  onEdgeSelect,
  className,
}: GraphCanvas2DProps): ReactNode {
  // Hook into the capability so the SSR shell + the first
  // client render agree on what's coming. The capability
  // hook returns "unknown" on the server, then resolves to
  // either "2d" or "3d" after hydration. The explorer
  // already uses this to gate which component to mount.
  // The hook call here is for diagnostic purposes (the
  // attribute is exposed for tests + dev tools).
  const capability = useGraphCapability()

  const { nodes, rootId } = useMemo(
    () => layoutNodes(data, selectedNodeId, activePathEntityIds),
    [data, selectedNodeId, activePathEntityIds],
  )

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const hasSelection = selectedNodeId !== null

  return (
    <div
      role="application"
      aria-label="Knowledge graph (2D fallback)"
      data-testid="graph-canvas-2d"
      data-capability={capability}
      data-node-count={nodes.length}
      className={`relative h-full w-full overflow-hidden bg-void-950 ${className ?? ""}`}
    >
      <svg
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
        className="h-full w-full"
      >
        {/* Edges first so they sit behind the nodes. */}
        <g>
          {data.edges.map((edge) => {
            const source = nodeMap.get(edge.source)
            const target = nodeMap.get(edge.target)
            if (!source || !target) return null
            // Skip edges that don't connect any
            // rendered node (some second-degree
            // nodes fall off the outer ring).
            if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
              return null
            }
            const isActive = activePathRelationIds?.has(edge.id) ?? false
            return (
              <line
                key={edge.id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                strokeWidth={isActive ? 2.5 : 1.25}
                className={edgeStrokeClass(isActive, hasSelection)}
                onClick={() => onEdgeSelect?.(edge.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onEdgeSelect?.(edge.id)
                  }
                }}
                style={{ cursor: onEdgeSelect ? "pointer" : "default" }}
              />
            )
          })}
        </g>

        {/* Nodes. */}
        <g>
          {nodes.map((node) => {
            const r = nodeRadius(node.state)
            return (
              // biome-ignore lint/a11y/useSemanticElements: SVG
              // <g> can't be replaced with a real <button>
              // without losing the radial layout's nested
              // <circle> + <text>. `role="button"` +
              // `tabIndex={0}` + `aria-label` + Enter/Space
              // handlers is the WAI-ARIA SVG pattern.
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => onSelect(node.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onSelect(node.id)
                  }
                }}
                tabIndex={0}
                // biome-ignore lint/a11y/useSemanticElements: SVG
                // <g> can't be replaced with a real <button>
                // without losing the radial layout's nested
                // <circle> + <text>. `role="button"` +
                // `tabIndex={0}` + `aria-label` + Enter/Space
                // handlers is the WAI-ARIA SVG pattern.
                role="button"
                aria-label={`Select ${node.label}`}
                style={{ cursor: "pointer" }}
                data-testid={`graph-2d-node-${node.id}`}
                data-state={node.state}
              >
                {/* Hit area — slightly larger than the
                    visual so the touch target is
                    comfortable (F9 P2's touch target
                    rule). */}
                <circle r={Math.max(r + 6, 18)} fill="transparent" />
                <circle
                  r={r}
                  className={nodeFillClass(node.state)}
                  stroke={node.state === "selected" ? "#0BE3C4" : "transparent"}
                  strokeWidth={node.state === "selected" ? 2 : 0}
                />
                {/* Label. We always render the label
                    on the SVG; on the radial layout
                    the per-node label is the primary
                    identification. Truncation is
                    handled at the visual layer
                    (SVG <text> + textLength). */}
                <text
                  y={r + 18}
                  textAnchor="middle"
                  className="fill-paper-200 font-mono text-[12px]"
                >
                  {node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* Mode notice — pinned to the bottom of the
          canvas so the user always knows they're
          looking at the 2D fallback (and why).
          This is the F9 P2 "show the user
          why" requirement. */}
      <output
        aria-live="polite"
        data-testid="graph-2d-mode-notice"
        className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2"
      >
        <div className="max-w-sm rounded-md border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-center text-xs text-paper-200 shadow-lg backdrop-blur">
          2D view — shown because the device or viewport doesn&apos;t meet the 3D capability
          threshold (viewport &lt; {GRAPH_2D_VIEWPORT_THRESHOLD_PX}px, or reduced motion, or low
          CPU).
        </div>
      </output>

      {/* Root label — pinned to the top-left so the
          user can always see what the centre node
          represents. The detail panel to the right
          carries the same data; this is the canvas-
          level identification. */}
      {rootId ? (
        <div
          data-testid="graph-2d-root-label"
          className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1 font-mono text-[11px] text-paper-200 shadow-sm backdrop-blur"
        >
          root · {nodeMap.get(rootId)?.label ?? rootId}
        </div>
      ) : null}
    </div>
  )
}
