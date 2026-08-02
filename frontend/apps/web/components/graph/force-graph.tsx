/**
 * Force graph — the knowledge-graph explorer.
 *
 * Uses `react-force-graph-3d` (d3-force + Three.js) so the
 * physics, layout, and camera controls are solved for us; we
 * customise node / link materials via the library's hooks.
 *
 * The custom **edge-pulse** effect (a gradient stop travelling
 * along a TubeGeometry) lives in a follow-up PR; the
 * placeholder below is a plain link with an opacity gradient.
 *
 * Honours `prefers-reduced-motion` by pausing the simulation
 * after a single stabilisation pass and switching to static.
 */

"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/lib/motion/reduced-motion";

// Loaded on the client only — Three.js is too heavy to ship
// in the initial bundle.
const ForceGraph3D = dynamic(
  () => import("react-force-graph-3d"),
  { ssr: false },
) as unknown as typeof import("react-force-graph-3d").default;

interface GraphNode {
  id: string;
  name: string;
  type: string;
  color?: string;
}
interface GraphLink {
  source: string;
  target: string;
  relationship: string;
}

export function ForceGraph() {
  const reduce = usePrefersReducedMotion();
  const [data, setData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: [],
  });
  const ref = useRef<unknown>(null);

  useEffect(() => {
    // Placeholder data — real fetch via getApiClient() lands
    // once codegen has run.
    setData({
      nodes: [
        { id: "cortex", name: "Cortex", type: "Project" },
        { id: "fastapi", name: "FastAPI", type: "Technology" },
        { id: "postgres", name: "Postgres", type: "Technology" },
        { id: "redis", name: "Redis", type: "Technology" },
      ],
      links: [
        { source: "cortex", target: "fastapi", relationship: "USES" },
        { source: "cortex", target: "postgres", relationship: "USES" },
        { source: "cortex", target: "redis", relationship: "USES" },
        { source: "fastapi", target: "postgres", relationship: "DEPENDS_ON" },
      ],
    });
  }, []);

  useEffect(() => {
    // Reduced motion: stop the simulation once it has settled.
    if (!reduce) return;
    const t = setTimeout(() => {
      (ref.current as { pauseAnimation?: () => void } | null)?.pauseAnimation?.();
    }, 2000);
    return () => clearTimeout(t);
  }, [reduce, data]);

  const fgProps = useMemo(
    () => ({
      graphData: data,
      nodeLabel: "name",
      nodeAutoColorBy: "type",
      linkColor: () => "rgba(120, 120, 140, 0.5)",
      backgroundColor: "transparent",
      height: undefined as unknown as number,
    }),
    [data],
  );

  return (
    <div className="h-full w-full bg-background">
      {/* @ts-expect-error react-force-graph-3d is a class component */}
      <ForceGraph3D ref={ref} {...fgProps} />
    </div>
  );
}
