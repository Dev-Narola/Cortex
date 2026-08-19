/**
 * GraphNode — a single 3D node in the graph scene.
 *
 * **F6 Part 1.** The renderable primitive the
 * R3F `<Canvas>` mounts per node. Owns:
 *   - 3D geometry (sphere for now)
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
 * 35% opacity. The active-path state uses the
 * Spark gradient (out of scope for Part 1; the
 * type is wired so Part 2 can render it without
 * changing this component's surface).
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
import { useCallback } from "react"

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
}

/**
 * Map a node state → palette colour.
 *
 * **F6 Part 3 — Ember for active-path.** The
 * spec calls out the visual rule: default nodes
 * are Volt, active-query-path nodes are Ember.
 * The active-path colour is the bright Ember-500
 * (the same Ember used for accents + the
 * auth-hint cookie path), so the eye picks it up
 * even when the rest of the graph is at volt
 * brightness.
 *
 * **The exact shades are pinned so the visual
 * hierarchy is stable across renders.** The
 * dimmed state drops opacity (handled separately
 * in the material) so the colour itself can stay
 * close to default — dimming is about presence,
 * not palette.
 */
function nodeColorFor(state: GraphNodeState): string {
  switch (state) {
    case "selected":
      return "#bef264" // volt-300 — brightest
    case "active-path":
      return "#f97316" // Ember-500 — spec-defined for active traversal
    case "dimmed":
      return "#365314" // volt-900 — almost background
    default:
      return "#84cc16" // volt-500 — the spec default
  }
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

export function GraphNode({ node, state, onSelect }: GraphNodeProps) {
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
  const color = nodeColorFor(state)
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
        onClick={handleClick}
        userData={{ nodeId: node.id, state }}
        data-testid={`graph-node-${node.id}`}
      >
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={state === "selected" ? 0.6 : 0.25}
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
      <Html position={[0, 0.7, 0]} center distanceFactor={8} zIndexRange={[0, 0]}>
        <span
          className="select-none whitespace-nowrap rounded-md bg-void-900/80 px-2 py-0.5 text-xs font-medium text-paper-50 shadow-sm ring-1 ring-void-700"
          data-testid={`graph-node-label-${node.id}`}
        >
          {node.label}
        </span>
      </Html>
    </group>
  )
}

/**
 * Re-exports the visual-state helpers so tests
 * can pin the colour / scale / opacity mapping
 * without rendering the JSX. The contract is
 * part of the component's public surface even
 * though it isn't part of the React tree.
 */
export const GraphNodeInternals = {
  nodeColorFor,
  scaleFor,
  opacityFor,
}
