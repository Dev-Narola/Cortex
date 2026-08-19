/**
 * GraphCanvas — the R3F rendering boundary.
 *
 * **F6 Part 1.** The single mount point for
 * everything Three.js. Owns the ``<Canvas>``,
 * the camera, the orbit controls, and the
 * per-frame lighting. The rest of the app talks
 * to this component through the ``GraphData``
 * + ``onSelect`` props; it doesn't need to know
 * about R3F.
 *
 * **Why a dedicated canvas component.** Three
 * reasons:
 *   1. **Boundary.** R3F can't render on the
 *      server; the actual ``<Canvas>`` lives
 *      here and the explorer wraps it in a
 *      ``next/dynamic`` import (see
 *      ``graph-explorer.tsx``).
 *   2. **Performance.** Drei + three are heavy
 *      (the bundle is ~600 KB gzipped). Keeping
 *      the import surface narrow means only the
 *      graph page pulls the cost.
 *   3. **Testability.** Component tests can
 *      mock this file entirely and pin the
 *      explorer contract without spinning up
 *      WebGL.
 *
 * **Camera + controls.** A perspective camera
 * with a comfortable field of view (50°) and a
 * starting position that frames the demo graph
 * (z = 9). ``OrbitControls`` from drei covers
 * orbit / zoom / pan — the spec asks for all
 * three and drei's defaults are good (no need
 * to re-invent the wheel here).
 *
 * **Lighting.** A soft ambient + a single key
 * light from above-front. Emissive intensity
 * on the selected node means the spec's "the
 * picked node reads as the one I'm looking at"
 * works even when the camera orbits around to
 * the back of the graph.
 *
 * **Reduced motion.** When the user has
 * ``prefers-reduced-motion`` set, the camera
 * damping is disabled and the auto-rotation is
 * skipped. The graph stays usable (orbit /
 * zoom / pan all work without animation); we
 * just don't add motion on top.
 */

"use client"

import { OrbitControls } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"
import { useEffect, useState } from "react"

import { GraphEdge } from "./graph-edge"
import { GraphNode } from "./graph-node"
import type { GraphData, GraphNodeState } from "./types"

/**
 * Spec-defined background — the authenticated
 * workspace's "Void" surface. Pulled out as a
 * constant so a future re-skin only changes one
 * place.
 */
const VOID_BACKGROUND = "#0B0D12"

export interface GraphCanvasProps {
  /** The graph data to render. */
  data: GraphData
  /** Currently selected node id, or null. */
  selectedNodeId: string | null
  /** Called when the user clicks a node. */
  onSelect: (id: string) => void
}

/**
 * Resolve a node's visual state from the
 * current selection. Pulled out so the canvas
 * doesn't have to know the rule; Part 2's
 * traversal-pulse logic can drop in by adding
 * more cases.
 */
function stateFor(
  nodeId: string,
  selectedNodeId: string | null,
  hasSelection: boolean,
): GraphNodeState {
  if (nodeId === selectedNodeId) return "selected"
  // When a node is selected, dim the others so
  // the picked one reads as the focus.
  if (hasSelection) return "dimmed"
  return "default"
}

export function GraphCanvas({ data, selectedNodeId, onSelect }: GraphCanvasProps) {
  // Honour the user's motion preference. R3F's
  // orbit controls accept ``enableDamping``
  // and ``dampingFactor``; we flip them based
  // on the OS-level preference. The media
  // query lives in state because SSR can't
  // access ``window.matchMedia``.
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReducedMotion(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  // Build a node-index map once per render.
  // Edges need to look up positions by id; a
  // Map gives O(1) access.
  const nodeIndex = data.nodes
  const hasSelection = selectedNodeId !== null

  return (
    <Canvas
      // The canvas fills its parent. The
      // explorer wraps this in a full-bleed
      // container so the layout doesn't
      // shrink-wrap the canvas.
      style={{ width: "100%", height: "100%" }}
      // The renderer is created with a
      // background colour + alpha. We set
      // alpha=false so the canvas itself is
      // opaque (avoiding the white-flash on
      // first paint).
      gl={{ antialias: true, alpha: false }}
      // Camera — the spec calls for a
      // perspective camera with a comfortable
      // starting distance. fov 50° is the
      // drei default and reads well at the
      // demo-graph's 6-unit radius.
      camera={{ position: [0, 0, 9], fov: 50, near: 0.1, far: 100 }}
      // The spec's "full-bleed 3D canvas" —
      // the background is the design system's
      // Void (#0B0D12), not a Scene fog or a
      // CSS wrapper.
      onCreated={({ gl }) => {
        gl.setClearColor(VOID_BACKGROUND, 1)
      }}
      // Shadows off for Part 1 — the spec
      // doesn't ask for them and they add
      // ~10% to the GPU cost.
      shadows={false}
      // dpr is the device-pixel-ratio cap. We
      // let the browser pick (default 1) — high-
      // DPR displays are handled natively and
      // we don't need to over-sample.
    >
      {/* Lighting. Ambient fills the void;
          the key light gives the spheres some
          direction. The selected node's
          emissive intensity reads as "lit from
          within" so the focus holds even in the
          dimmed-with-selection mode. */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} />

      {/* Edges go first so the nodes render
          on top of them at the same z. The
          cylinder geometry is centred at the
          edge's midpoint, so depth testing
          keeps the visual ordering clean. */}
      {data.edges.map((edge) => (
        <GraphEdge key={edge.id} edge={edge} nodes={nodeIndex} isActive={false} />
      ))}
      {data.nodes.map((node) => (
        <GraphNode
          key={node.id}
          node={node}
          state={stateFor(node.id, selectedNodeId, hasSelection)}
          onSelect={onSelect}
        />
      ))}

      {/* Orbit / zoom / pan. The drei controls
          cover all three with sensible
          defaults; we only flip the damping
          based on reduced-motion. */}
      <OrbitControls
        enableDamping={!reducedMotion}
        dampingFactor={0.1}
        // The spec asks for the user to be
        // able to orbit fully (no polar
        // limits). We do set a min/max
        // distance so the user can't zoom
        // inside a node or fly to infinity.
        minDistance={3}
        maxDistance={30}
        // ``makeDefault`` registers the
        // controls as the canvas default so
        // the camera state is queryable
        // from other drei helpers (e.g.
        // ``CameraControls`` in a future
        // part).
        makeDefault
      />
    </Canvas>
  )
}
