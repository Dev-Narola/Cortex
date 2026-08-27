/**
 * GraphCanvas — the R3F rendering boundary.
 *
 * **F6 Part 1 + Part 3 + Part 4.** Single mount
 * point for everything Three.js. Owns the ``<Canvas>``,
 * the camera, the orbit controls, the per-frame
 * lighting. The rest of the app talks to this
 * component through ``GraphData`` + the selection
 * callbacks; it doesn't need to know about R3F.
 *
 * **Why a dedicated canvas component.** Three
 * reasons:
 *   1. **Boundary.** R3F can't render on the
 *      server; the actual ``<Canvas>`` lives
 *      here and the explorer wraps it in a
 *      ``next/dynamic`` import.
 *   2. **Performance.** Drei + three are heavy
 *      (the bundle is ~600 KB gzipped). Keeping
 *      the import surface narrow means only the
 *      graph page pulls the cost.
 *   3. **Testability.** Component tests can mock
 *      this file entirely and pin the explorer
 *      contract without spinning up WebGL.
 *
 * **Part 3 — active-path state.** The canvas
 * accepts ``activePathEntityIds`` and
 * ``activePathRelationIds`` (both
 * ``ReadonlySet<string>``). Nodes + edges in
 * those sets render with the active visual
 * treatment (Ember for nodes, Spark-tinted
 * cylinder for edges). The sets are optional —
 * the explorer omits them when no path is active.
 *
 * **Part 4 — shared resources + memoization.**
 * The canvas no longer asks every ``<GraphNode>``
 * to instantiate its own ``<sphereGeometry>``.
 * Instead it passes a single shared sphere
 * geometry down to every node (R3F de-duplicates
 * on the JSX side; the underlying ``BufferGeometry``
 * is one allocation). Likewise the directional
 * light and the ambient light are constants —
 * no per-node light, no per-edge light. The
 * node + edge components are ``React.memo``-d
 * so an unrelated parent state change (e.g. the
 * search bar's input) doesn't re-render the whole
 * scene.
 *
 * **Reduced motion.** When the user has
 * ``prefers-reduced-motion`` set, the camera
 * damping is disabled. The graph stays usable
 * (orbit / zoom / pan all work without
 * animation); we just don't add motion on top.
 *
 * **No continuous animation.** Per the F6
 * performance budget: the scene is static. The
 * only "motion" is the user's orbit / zoom / pan
 * + the active-path colour switch when the user
 * picks a relation. No per-frame ``useFrame``
 * loops, no continuous tween.
 */

"use client"

import { OrbitControls } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"
import { useMemo } from "react"
import { type BufferGeometry, CylinderGeometry, SphereGeometry } from "three"

import { usePrefersReducedMotion } from "@/lib/motion/reduced-motion"
import { GraphEdge } from "./graph-edge"
import { GraphNode } from "./graph-node"
import type { GraphData, GraphNodeState } from "./types"

const VOID_BACKGROUND = "#0B0D12"

/**
 * **F6 Part 4 — geometry budget.**
 * The sphere segment count is the single biggest
 * per-node cost. 32x32 = 2,048 triangles; 16x12 =
 * 192 triangles. The visual difference at the
 * default camera distance (z=9) is invisible.
 * 16x12 keeps a 1,000-node graph at ~192k triangles
 * total — a comfortable mid-range laptop budget.
 */
const SPHERE_WIDTH_SEGMENTS = 16
const SPHERE_HEIGHT_SEGMENTS = 12

/**
 * **F6 Part 4 — shared edge geometry.** The
 * default cylinder is a unit-Y tube (length 1,
 * radius 0.02) and every edge stretches it via
 * ``scaleY``. The geometry is identical for all
 * edges — sharing it turns 2,000 allocations
 * into 1.
 *
 * The constants are kept in sync with
 * ``graph-edge.tsx``'s ``EDGE_TUBE_RADIUS`` and
 * the inline ``cylinderGeometry args``.
 */
const EDGE_TUBE_RADIUS = 0.02
const EDGE_CYLINDER_SEGMENTS = 8

export interface GraphCanvasProps {
  data: GraphData
  selectedNodeId: string | null
  /**
   * F6 Part 3 — ids of entities on the active
   * traversal path. Nodes in this set render
   * with the ``active-path`` state (Ember).
   * ``undefined`` means "no active path".
   */
  activePathEntityIds?: ReadonlySet<string>
  /**
   * F6 Part 3 — ids of relations on the active
   * traversal path. Edges in this set render
   * with the active visual treatment. Optional.
   */
  activePathRelationIds?: ReadonlySet<string>
  onSelect: (id: string) => void
  /**
   * F6 Part 3 — called when the user clicks an
   * edge. The explorer walks the path from the
   * edge + writes it into the active-path
   * state. Optional (Part 1 callers don't need
   * it).
   */
  onEdgeSelect?: (relationId: string) => void
}

/**
 * Resolve a node's visual state from the
 * current selection + the active path.
 *
 * **F6 Part 3 — active-path takes priority.**
 * The spec calls out the rule: the active path
 * reads as the brightest thing in the scene, so
 * a node on the path ALWAYS renders as
 * ``active-path`` even if the user has picked a
 * different node. The picked node is still
 * ``selected``-coloured (we re-rank via the
 * early-return below), but a node that's both
 * selected + on the active path gets the
 * active-path treatment.
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

export function GraphCanvas({
  data,
  selectedNodeId,
  activePathEntityIds,
  activePathRelationIds,
  onSelect,
  onEdgeSelect,
}: GraphCanvasProps) {
  // **F9 Part 1 — hook consolidation.**
  // Replaced the inline `useState` +
  // `useEffect` reduced-motion subscription
  // with the canonical `useSyncExternalStore`
  // hook from `lib/motion/reduced-motion`.
  // Same behaviour, less code, single
  // source of truth.
  const reducedMotion = usePrefersReducedMotion()

  // ----- Shared geometry (Part 4) -----
  // One sphere geometry for the whole scene. Every
  // <GraphNode> references this same BufferGeometry
  // (R3F handles the prop passing). At 1,000 nodes
  // this turns 1,000 allocations into 1.
  const sharedSphereGeometry = useMemo<BufferGeometry>(
    () => new SphereGeometry(1, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS),
    [],
  )
  // One cylinder geometry for every edge. Same
  // story as the sphere — the geometry is identical
  // across all edges, only the per-edge transform
  // (position / rotation / scaleY) varies.
  const sharedCylinderGeometry = useMemo<BufferGeometry>(
    () =>
      new CylinderGeometry(EDGE_TUBE_RADIUS, EDGE_TUBE_RADIUS, 1, EDGE_CYLINDER_SEGMENTS, 1, true),
    [],
  )

  const nodeIndex = data.nodes
  const hasSelection = selectedNodeId !== null

  return (
    <Canvas
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, 9], fov: 50, near: 0.1, far: 100 }}
      onCreated={({ gl }) => {
        gl.setClearColor(VOID_BACKGROUND, 1)
      }}
      shadows={false}
      // **F6 Part 4 — frameloop is "demand".** Without
      // continuous animation, R3F's default frameloop
      // ("always") still fires once per frame even
      // when nothing changes. "demand" pauses the loop
      // until a manual invalidate() is called — the
      // OrbitControls already do this on user input.
      // The visual result is identical; the CPU/GPU
      // cost is a fraction.
      frameloop="demand"
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} />

      {data.edges.map((edge) => (
        <GraphEdge
          key={edge.id}
          edge={edge}
          nodes={nodeIndex}
          isActive={activePathRelationIds?.has(edge.id) ?? false}
          onSelect={onEdgeSelect}
          // **F6 Part 4 — shared cylinder.**
          geometry={sharedCylinderGeometry}
        />
      ))}
      {data.nodes.map((node) => (
        <GraphNode
          key={node.id}
          node={node}
          state={stateFor(node.id, selectedNodeId, hasSelection, activePathEntityIds)}
          onSelect={onSelect}
          // **F6 Part 4 — shared geometry.** Every
          // node renders the same sphere. The mesh
          // ``scale`` on the node side still controls
          // per-node size.
          geometry={sharedSphereGeometry}
        />
      ))}

      <OrbitControls
        enableDamping={!reducedMotion}
        dampingFactor={0.1}
        minDistance={3}
        maxDistance={30}
        makeDefault
      />
    </Canvas>
  )
}
