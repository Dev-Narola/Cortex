/**
 * Knowledge graph explorer — `/app/graph`.
 *
 * The flagship screen. Hosts the `react-force-graph-3d`
 * canvas (lazy-loaded so the initial bundle stays small)
 * with the brand Spark gradient on the active node ring and
 * the travelling-gradient edge pulse on query traversal.
 */
"use client";

import dynamic from "next/dynamic";

const ForceGraph = dynamic(
  () => import("@/components/graph/force-graph").then((m) => m.ForceGraph),
  { ssr: false, loading: () => <GraphSkeleton /> },
);

export default function GraphPage() {
  return (
    <div className="-m-6 h-[calc(100vh-3.5rem)]">
      <ForceGraph />
    </div>
  );
}

function GraphSkeleton() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading the knowledge graph…
    </div>
  );
}
