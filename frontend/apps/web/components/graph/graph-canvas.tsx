/**
 * GraphCanvas — the R3F rendering boundary.
 *
 * **F6 Part 1 + Part 3.** Single mount point
 * for everything Three.js. Owns the ``<Canvas>``,
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
 * **Reduced motion.** When the user has
 * ``prefers-reduced-motion`` set, the camera
 * damping is disabled. The graph stays usable
 * (orbit / zoom / pan all work without
 * animation); we just don't add motion on top.
 */

"use client"

import { OrbitControls } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"
import { useEffect, useState } from "react"

import { GraphEdge } from "./graph-edge"
import { GraphNode } from "./graph-node"
import type { GraphData, GraphNodeState } from "./types"

const VOID_BACKGROUND = "#0B0D12"

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
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReducedMotion(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const nodeIndex = data.nodes
  const hasSelection = selectedNodeId !== null

  return (
    <Canvas
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, alpha: false }}
      camera={{ position: [0, 0, 9], fov: 50, near: 0.1, far: 100 }}
      onCreated={({ gl }) => {
        gl.setClearColor(VOID_BACKGROUND, 1)
      }}
      shadows={false}
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
        />
      ))}
      {data.nodes.map((node) => (
        <GraphNode
          key={node.id}
          node={node}
          state={stateFor(node.id, selectedNodeId, hasSelection, activePathEntityIds)}
          onSelect={onSelect}
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
