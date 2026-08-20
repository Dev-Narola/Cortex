/**
 * KnowledgeGraphVisual — the abstract
 * "entities + relationships" graph for
 * the F8 Knowledge Graph section.
 *
 * **F8 Part 3.** A lightweight SVG node-
 * network. The marketing message is
 * that Cortex extracts entities (people,
 * concepts, projects, technologies,
 * documents) and the relationships
 * between them, so retrieval can use
 * more than isolated chunks.
 *
 * **What the visual shows.**
 * - 9 nodes across 4 categories
 *   (Document, Person, Concept, Project,
 *   Technology). A real Cortex graph has
 *   thousands of nodes; the marketing
 *   visual shows the *shape* of a graph
 *   without drowning the visitor in
 *   complexity.
 * - 10 edges connecting the nodes. The
 *   "important relationship" — the one
 *   the marketing copy wants to
 *   highlight — uses the Spark gradient
 *   and pulses once on entry.
 *
 * **Animation.**
 * - 0.0s: nodes fade + scale in (staggered
 *   ~30ms per node for a "constellation
 *   appears" feel).
 * - 0.2s: edges fade in.
 * - 0.8s: the highlight edge settles into
 *   its final state (slightly brighter
 *   via the Spark gradient).
 * - After entry: completely static. No
 *   continuous motion — per the F8 spec:
 *   "Don't animate every node forever...
 *   After the entrance choreography:
 *   static graph."
 *
 * **Why no real backend call.** The
 * marketing page must remain fast +
 * cacheable. The actual Graph Explorer
 * is a separate authenticated app surface
 * at `/app/graph`; the marketing visual
 * is illustrative, not live.
 *
 * **Decorative.** Marked `aria-hidden`
 * on the root. The eyebrow + title +
 * description in the FeatureSection
 * wrapper carry the meaning.
 *
 * **Reduced motion.** The whole animation
 * is `useInView`-driven; reduced motion
 * fires `onEnter` immediately, so the
 * graph lands in its final state without
 * the entry choreography. The static
 * graph is the final state — no
 * information disappears.
 */
"use client"

import { useCallback, useRef } from "react"

import { useInView } from "@/lib/marketing/animations"

type NodeCategory = "Document" | "Person" | "Concept" | "Project" | "Technology"

interface GraphNode {
  id: string
  x: number
  y: number
  r: number
  label: string
  category: NodeCategory
}

interface GraphEdge {
  from: string
  to: string
  /** Edges with `highlight: true` get the
   *  Spark gradient + a single pulse. */
  highlight?: boolean
}

const NODES: ReadonlyArray<GraphNode> = [
  // Documents
  { id: "doc-1", x: 80, y: 80, r: 22, label: "Research Notes", category: "Document" },
  { id: "doc-2", x: 200, y: 50, r: 18, label: "Blueprint", category: "Document" },
  // Person
  { id: "person-1", x: 350, y: 90, r: 18, label: "Dev", category: "Person" },
  // Concepts
  { id: "concept-1", x: 500, y: 70, r: 20, label: "Hybrid Search", category: "Concept" },
  { id: "concept-2", x: 120, y: 200, r: 18, label: "Tenancy", category: "Concept" },
  { id: "concept-3", x: 320, y: 230, r: 18, label: "Citations", category: "Concept" },
  // Project
  { id: "project-1", x: 500, y: 210, r: 20, label: "Cortex", category: "Project" },
  // Technology
  { id: "tech-1", x: 80, y: 320, r: 18, label: "Postgres", category: "Technology" },
  { id: "tech-2", x: 320, y: 340, r: 18, label: "pgvector", category: "Technology" },
]

const EDGES: ReadonlyArray<GraphEdge> = [
  { from: "doc-1", to: "concept-2" },
  { from: "doc-1", to: "person-1" },
  { from: "doc-2", to: "concept-1" },
  { from: "concept-1", to: "project-1", highlight: true },
  { from: "person-1", to: "concept-1" },
  { from: "concept-2", to: "concept-3" },
  { from: "concept-3", to: "project-1" },
  { from: "project-1", to: "tech-2" },
  { from: "tech-1", to: "concept-2" },
  { from: "tech-2", to: "concept-1" },
]

const CATEGORY_FILL: Record<NodeCategory, string> = {
  Document: "oklch(0.78 0.13 60 / 0.95)", // ember-300
  Person: "oklch(0.78 0.16 145 / 0.95)", // volt-400
  Concept: "oklch(0.7 0.18 30 / 0.95)", // ember-500
  Project: "oklch(0.6 0.2 145 / 0.95)", // volt-600
  Technology: "oklch(0.6 0.04 250 / 0.85)", // cloud-600 (neutral)
}

export function KnowledgeGraphVisual() {
  const ref = useRef<HTMLDivElement>(null)
  const onEnter = useCallback(() => {
    if (ref.current) {
      ref.current.dataset.revealed = "true"
    }
  }, [])
  useInView(ref, onEnter)

  return (
    <div
      ref={ref}
      aria-hidden
      data-testid="knowledge-graph-visual"
      data-revealed="false"
      className="relative mx-auto w-full max-w-2xl"
    >
      <svg
        viewBox="0 0 600 400"
        xmlns="http://www.w3.org/2000/svg"
        className="h-auto w-full"
      >
        <defs>
          <linearGradient
            id="kg-edge-highlight"
            x1="0"
            y1="0"
            x2="1"
            y2="0"
          >
            <stop offset="0%" stopColor="#FF6A3D" />
            <stop offset="100%" stopColor="#0BE3C4" />
          </linearGradient>
        </defs>

        {/* Edges (drawn first so they sit
            behind the node circles). */}
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-muted-foreground/40"
        >
          {EDGES.map((edge) => {
            const from = NODES.find((n) => n.id === edge.from)
            const to = NODES.find((n) => n.id === edge.to)
            if (!from || !to) return null
            if (edge.highlight) {
              // The "important relationship"
              // — Spark gradient + a single
              // pulse on entry.
              return (
                <line
                  key={`${edge.from}-${edge.to}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="url(#kg-edge-highlight)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  data-testid="kg-edge-highlight"
                  className="opacity-0 transition-opacity duration-500 ease-out [transition-delay:800ms] data-[revealed=true]:opacity-100"
                />
              )
            }
            return (
              <line
                key={`${edge.from}-${edge.to}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                className="opacity-0 transition-opacity duration-500 ease-out [transition-delay:200ms] data-[revealed=true]:opacity-100"
              />
            )
          })}
        </g>

        {/* Nodes. */}
        <g>
          {NODES.map((node, i) => {
            // Stagger the entry: 30ms per
            // node. Total entry: ~9 × 30 +
            // 300ms duration = ~570ms.
            const delayMs = i * 30
            return (
              <g
                key={node.id}
                data-testid={`kg-node-${node.id}`}
                className="opacity-0 transition-all duration-300 ease-out [transition-delay:var(--node-delay)] data-[revealed=true]:opacity-100 data-[revealed=true]:scale-100 scale-90"
                style={{ ["--node-delay" as string]: `${delayMs}ms` }}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.r}
                  fill={CATEGORY_FILL[node.category]}
                  className="drop-shadow-sm"
                />
                <text
                  x={node.x}
                  y={node.y + node.r + 16}
                  textAnchor="middle"
                  className="fill-current font-mono text-[10px] text-foreground/80"
                >
                  {node.label}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {(["Document", "Person", "Concept", "Project", "Technology"] as NodeCategory[]).map(
          (cat) => (
            <span key={cat} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: CATEGORY_FILL[cat] }}
              />
              {cat}
            </span>
          ),
        )}
      </div>
    </div>
  )
}
