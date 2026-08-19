/**
 * GraphEdge — a single relationship line.
 *
 * **F6 Part 1.** Renders an undirected line
 * between two nodes. The line is the spec's
 * default "subtle Slate" colour and stays static
 * for Part 1 — the Spark gradient pulse that
 * fires when a query traverses an edge is
 * deliberately deferred to Part 2.
 *
 * **Why a static colour.** Per the spec, the
 * edge-pulse is part of the *query feedback*
 * loop (the moment a traversal lands on an
 * edge), not the default rendering. Building
 * it now would mean threading a query-result
 * state through the explorer that doesn't exist
 * yet. The type is wired (``isActive``) so
 * Part 2 can drop in without changing this
 * component's surface.
 *
 * **Geometry.** We use a thin cylinder oriented
 * along the (start → end) vector. The
 * alternative — drei's ``<Line>`` — is sharper
 * at high zoom but disappears at low zoom, which
 * kills the "always-on" graph feel the spec
 * wants.
 *
 * **Tested via mocked Canvas.** Same constraint
 * as ``GraphNode`` — R3F can't render to
 * happy-dom, so tests pin the geometry-helper
 * contract instead of the visual.
 */

"use client"

import { Html } from "@react-three/drei"
import { useMemo } from "react"
import { Euler, Quaternion, Vector3 } from "three"

import type { GraphEdge as GraphEdgeData, GraphNode } from "./types"

export interface GraphEdgeProps {
  edge: GraphEdgeData
  /** All nodes in the graph — we look up the
   *  source + target positions from this map. */
  nodes: GraphNode[]
  /** Whether the edge is on the active path
   *  (Part 2 wires this; Part 1 always passes
   *  ``false``). */
  isActive?: boolean
}

/**
 * Look up a node by id; returns ``null`` if the
 * node isn't in the map (which would be a
 * data-shape bug we want to surface, not
 * silently render with a zero-length edge).
 */
function findNode(nodes: GraphNode[], id: string): GraphNode | null {
  return nodes.find((n) => n.id === id) ?? null
}

/**
 * Slate shade for edges. The exact tone matches
 * the spec's "subtle Slate" — bright enough to
 * read on Void at low zoom, low enough to
 * disappear when the user is focused on a
 * node. Part 2 can swap this for the Spark
 * gradient when an edge is on the active
 * traversal.
 */
const EDGE_COLOR = "#475569" // slate-600
const EDGE_COLOR_ACTIVE = "#a3e635" // volt-400 — placeholder for Part 2
const EDGE_OPACITY = 0.6
const EDGE_OPACITY_ACTIVE = 0.9

/**
 * Tube radius — thin enough to read as a line,
 * thick enough to not pixelate at the default
 * camera distance.
 */
const EDGE_TUBE_RADIUS = 0.02

/**
 * Pure math helper — exported for unit tests
 * (no JSX, no R3F dependency). Computes the
 * transform that aligns a unit-Y cylinder to
 * the (start → end) vector.
 *
 *   - ``position``  — the midpoint (the cylinder
 *     is anchored at its centre)
 *   - ``rotation``  — the Euler that maps the
 *     cylinder's local Y axis to the
 *     ``end - start`` direction
 *   - ``scaleY``    — the cylinder's length
 *     along its Y axis (the unit cylinder is
 *     1 unit tall; we stretch it to fit the
 *     edge)
 */
export interface EdgeTransform {
  position: [number, number, number]
  rotation: [number, number, number]
  scaleY: number
}

export function computeEdgeTransform(start: Vector3, end: Vector3): EdgeTransform {
  const mid = start.clone().add(end).multiplyScalar(0.5)
  const dir = end.clone().sub(start)
  const length = dir.length()
  // Default cylinder is oriented along Y. We
  // need to rotate from (0,1,0) to the
  // normalised direction. Quaternion handles
  // the "axis X to axis Y" case correctly,
  // including the 180° edge case.
  const yAxis = new Vector3(0, 1, 0)
  const dirN = dir.clone().normalize()
  const q = new Quaternion().setFromUnitVectors(yAxis, dirN)
  const euler = new Euler(0, 0, 0, "XYZ")
  euler.setFromQuaternion(q)
  return {
    position: [mid.x, mid.y, mid.z],
    rotation: [euler.x, euler.y, euler.z],
    scaleY: length,
  }
}

export function GraphEdge({ edge, nodes, isActive = false }: GraphEdgeProps) {
  // Memoize the curve so the geometry isn't
  // recomputed on every React render. The
  // dependency list is small (edge + nodes) so
  // the memo is cheap.
  const { start, end, midpoint, isDegenerate } = useMemo(() => {
    const s = findNode(nodes, edge.source)
    const t = findNode(nodes, edge.target)
    if (!s || !t) {
      // Data bug: edge references a missing
      // node. Render a zero-length line so the
      // rest of the scene still works. The
      // error path is loud in dev (console)
      // because silent zero-edges are the
      // worst kind of bug to track down in 3D.
      if (typeof console !== "undefined") {
        console.warn(`[graph] edge ${edge.id} references a missing node`, {
          source: edge.source,
          target: edge.target,
        })
      }
      const zero = new Vector3(0, 0, 0)
      return {
        start: zero,
        end: zero.clone(),
        midpoint: zero.clone(),
        isDegenerate: true,
      }
    }
    const startV = new Vector3(...s.position)
    const endV = new Vector3(...t.position)
    return {
      start: startV,
      end: endV,
      midpoint: startV.clone().add(endV).multiplyScalar(0.5),
      isDegenerate: startV.distanceTo(endV) === 0,
    }
  }, [edge.id, edge.source, edge.target, nodes])

  // Apply the transform. Re-computing it on
  // every render is cheap, but the memo keeps
  // the mesh from re-rendering when the
  // parent's other state changes.
  const transform = useMemo(
    () => (isDegenerate ? null : computeEdgeTransform(start, end)),
    [start, end, isDegenerate],
  )

  const color = isActive ? EDGE_COLOR_ACTIVE : EDGE_COLOR
  const opacity = isActive ? EDGE_OPACITY_ACTIVE : EDGE_OPACITY

  return (
    <group>
      {!isDegenerate && transform ? (
        <mesh
          position={transform.position}
          rotation={transform.rotation}
          scale={[1, transform.scaleY, 1]}
          data-testid={`graph-edge-${edge.id}`}
          data-active={isActive || undefined}
        >
          <cylinderGeometry args={[EDGE_TUBE_RADIUS, EDGE_TUBE_RADIUS, 1, 8, 1, true]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={opacity}
            emissive={color}
            emissiveIntensity={isActive ? 0.5 : 0}
          />
        </mesh>
      ) : null}
      {/* Optional relation-type label. Only
          rendered when the data carries one.
          The midpoint float is a good place for
          it; the label's ``distanceFactor``
          keeps it readable at any zoom. */}
      {edge.relationType && !isDegenerate ? (
        <EdgeLabel position={midpoint} text={edge.relationType} active={isActive} />
      ) : null}
    </group>
  )
}

/**
 * Floating label for the edge. Uses drei's
 * ``<Html>`` so the typography comes from
 * Tailwind. Currently shows the relation type
 * (when present); the active-path variant will
 * eventually use the Spark gradient.
 */
function EdgeLabel({
  position,
  text,
  active,
}: {
  position: Vector3
  text: string
  active: boolean
}) {
  return (
    <Html
      position={[position.x, position.y, position.z]}
      center
      distanceFactor={10}
      zIndexRange={[-1, -1]}
    >
      <span
        className="select-none whitespace-nowrap rounded bg-void-900/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-paper-200/80"
        data-active={active || undefined}
        data-testid={`graph-edge-label-${text}`}
      >
        {text}
      </span>
    </Html>
  )
}

export const GraphEdgeInternals = {
  EDGE_COLOR,
  EDGE_COLOR_ACTIVE,
  EDGE_TUBE_RADIUS,
}
