/**
 * GraphNode — a single 3D node in the graph scene.
 *
 * **F6 Part 1 + Part 3 + Part 4.** The renderable
 * primitive the R3F `<Canvas>` mounts per node. Owns:
 *   - 3D geometry (sphere — Part 4 receives a shared
 *     geometry from the canvas to keep allocations flat
 *     regardless of node count)
 *   - material / colour
 *   - selection state visual
 *   - label (via `<Html>` from drei)
 *   - click handler that bubbles up to the
 *     explorer's selection state
 *
 * **Why a sphere.** Spheres read well at any
 * zoom level and don't share a strong visual
 * bias (squares feel "document-like", cylinders
 * "database-like", which leaks the type). Part 2
 * can introduce per-`type` geometry once the API
 * lands and the adapter knows the entity taxonomy.
 *
 * **Colour — Volt by default.** Per the UI spec,
 * the resting state of a node is `volt-500`. The
 * `selected` state shifts to `volt-300` (brighter
 * for visibility on the dark Void background)
 * and the dimmed state drops to `volt-900` at
 * 35% opacity. The active-path state uses
 * Ember-500 (per UI spec — the bright Ember
 * reads as "the thing the user is looking at").
 *
 * **Part 4 — performance.**
 *   - ``React.memo`` wraps the export so unrelated
 *     state changes (e.g. the search bar's input,
 *     the detail card's open state) don't re-render
 *     the whole graph. The custom comparator checks
 *     ``state`` + ``node.id`` + the prop identities
 *     that actually matter.
 *   - The geometry is shared across every node
 *     (the canvas passes one ``BufferGeometry``
 *     down). R3F handles the per-node mesh; the
 *     GPU sees a single geometry reference.
 *   - The material's ``emissive`` + ``color`` are
 *     derived from the ``state`` prop, so a state
 *     change is one prop diff — not a re-mount.
 *
 * **Tested via mocked Canvas.** R3F can't render
 * to happy-dom (no WebGL). The component exports
 * the selection callback contract + the geometry
 * branch logic; the visual state is verified in
 * Storybook / browser. Tests pin the click
 * callback + the type/state → colour mapping.
 */

"use client"

import { Html } from "@react-three/drei"
import type { ThreeEvent } from "@react-three/fiber"
import { memo, useCallback, useState } from "react"
import type { BufferGeometry } from "three"

import { ACTIVE_PATH_COLOR, SELECTED_COLOR, typeColorFor } from "./colors"
import type { GraphNode as GraphNodeData, GraphNodeState } from "./types"

export interface GraphNodeProps {
  /** The node data (id, label, type, position). */
  node: GraphNodeData
  /** Visual state. Drives colour + scale. */
  state: GraphNodeState
  /**
   * Called when the user clicks the node. The
   * explorer owns the selection state and reads
   * ``node.id`` from the event to update it.
   */
  onSelect: (id: string) => void
  /**
   * **F6 Part 4 — shared geometry.** The canvas
   * passes one ``BufferGeometry`` down so every
   * node shares the same sphere geometry. Required
   * (no fallback to an inline geometry — that
   * would defeat the optimisation).
   */
  geometry: BufferGeometry
  /** Always show the name (small graphs, the selection). Otherwise it shows on hover. */
  showLabel?: boolean
}

function nodeColorFor(state: GraphNodeState, type?: string): string {
  if (state === "selected") return SELECTED_COLOR
  if (state === "active-path") return ACTIVE_PATH_COLOR
  // Dimmed keeps its type colour; opacityFor fades it.
  return typeColorFor(type)
}

/**
 * Map a node state → sphere scale. Selection bumps
 * the size slightly so the picked node reads as
 * "the one I'm looking at" without a separate
 * ring or outline.
 */
function scaleFor(state: GraphNodeState): number {
  switch (state) {
    case "selected":
      return 0.45
    case "active-path":
      return 0.42
    case "dimmed":
      return 0.28
    default:
      return 0.32
  }
}

/**
 * Map a node state → material opacity. Lets us
 * dim the un-focused nodes without changing
 * their underlying colour.
 */
function opacityFor(state: GraphNodeState): number {
  switch (state) {
    case "dimmed":
      return 0.35
    default:
      return 1
  }
}

/**
 * Internal — re-exported via ``GraphNodeInternals``
 * so tests can pin the colour / scale / opacity
 * mapping without rendering the JSX.
 */
function GraphNodeImpl({ node, state, onSelect, geometry, showLabel = true }: GraphNodeProps) {
  const [hovered, setHovered] = useState(false)
  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      // Stop the click from reaching the orbit
      // controls (otherwise the camera also
      // rotates while the user is selecting a
      // node).
      e.stopPropagation()
      onSelect(node.id)
    },
    [node.id, onSelect],
  )

  // Pulled out so the test can pin the mapping
  // without rendering the JSX.
  const color = nodeColorFor(state, node.type)
  const labelVisible = showLabel || hovered || state === "selected" || state === "active-path"
  const scale = scaleFor(state)
  const opacity = opacityFor(state)

  return (
    <group position={node.position}>
      {/*
       * Keyboard a11y (Part 1 gap). R3F's
       * ``<mesh>`` doesn't natively fire
       * keyboard events — focus + Enter is a
       * non-trivial problem in 3D that the
       * R3F keyboard event system addresses
       * in a later release. For Part 1 the
       * only path to select a node is the
       * click handler; Part 2 (or the F9
       * accessibility pass) will wire
       * tabindex + keyboard handlers when
       * the spec's full a11y contract lands.
       *
       * The biome-ignore below is the right
       * call here: adding a no-op
       * ``onKeyDown`` would silently fail
       * (R3F's mesh doesn't bubble keyboard
       * events), and the spec already defers
       * the full a11y pass to F9.
       */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: R3F's <mesh> doesn't accept onKeyDown */}
      <mesh
        scale={scale}
        geometry={geometry}
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
        userData={{ nodeId: node.id, state }}
        data-testid={`graph-node-${node.id}`}
      >
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={state === "selected" ? 0.45 : hovered ? 0.35 : 0.12}
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>
      {/* Label floats just above the node. ``Html``
          from drei anchors a regular DOM element
          in 3D space, so the typography comes from
          Tailwind and matches the rest of the
          app. ``distanceFactor`` keeps the label
          readable at any zoom level. */}
      {labelVisible ? (
        <Html position={[0, 0.7, 0]} center distanceFactor={8} zIndexRange={[0, 0]}>
          <span
            className={`pointer-events-none select-none whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm ring-1 ${
              state === "selected"
                ? "bg-primary text-primary-foreground ring-transparent"
                : "bg-popover/90 text-foreground ring-border"
            }`}
            data-testid={`graph-node-label-${node.id}`}
          >
            {node.label}
          </span>
        </Html>
      ) : null}
    </group>
  )
}

/**
 * **F6 Part 4 — memoized export.** The default
 * export is wrapped in ``React.memo`` with a custom
 * comparator so the node only re-renders when the
 * props that actually matter change (``state``,
 * ``node.position``, ``node.id``). Unrelated state
 * changes (the search bar's input, the detail
 * card's open state, the camera's orbit state)
 * skip the node render.
 */
export const GraphNode = memo(GraphNodeImpl, (prev, next) => {
  if (prev.state !== next.state) return false
  if (prev.showLabel !== next.showLabel) return false
  if (prev.onSelect !== next.onSelect) return false
  if (prev.geometry !== next.geometry) return false
  if (prev.node.id !== next.node.id) return false
  if (prev.node.label !== next.node.label) return false
  const [px, py, pz] = prev.node.position
  const [nx, ny, nz] = next.node.position
  if (px !== nx || py !== ny || pz !== nz) return false
  return true
})

/**
 * Re-exports the visual-state helpers so tests
 * can pin the colour / scale / opacity mapping
 * without rendering the JSX. The contract is
 * part of the component's public surface even
 * though it isn't part of the React tree.
 */
export const GraphNodeInternals = {
  nodeColorFor,
  typeColorFor,
  scaleFor,
  opacityFor,
}
