/**
 * HeroVisual — the abstract node-network
 * that sits below the hero headline.
 *
 * **F8 Part 1.** Lightweight SVG (no
 * Canvas, no 3D, no `three.js`). The
 * actual Knowledge Graph Explorer (the F6
 * R3F implementation) is route-scoped to
 * `/app/graph` and does NOT load on the
 * marketing site (per the spec: "The
 * marketing hero should remain lightweight"
 * — heavy 3D systems must be lazy-loaded
 * only where used).
 *
 * **What it visualises.** A node/edge
 * field that *suggests* connected knowledge
 * without being a literal F6 graph. The
 * design goal is "you'd believe this if
 * someone told you it was a thumbnail of
 * the F6 graph" — not a 1:1 replica.
 *
 * **Three layers.**
 *   1. **Edges** (drawn first so they're
 *      under the nodes). A mix of straight
 *      and slight curves. Some lines
 *      thicker than others, mirroring the
 *      F6 graph's "primary path" pattern.
 *   2. **Nodes** — small circles. A handful
 *      of "larger" nodes act as the
 *      anchors; the smaller ones are the
 *      satellite entities.
 *   3. **Highlight** — a single "query
 *      path" that lights up two nodes + the
 *      edge between them. This is the
 *      trust signal: the same visual
 *      grammar the user will see in the
 *      F6 explorer when they ask a
 *      question.
 *
 * **Decorative.** Marked `aria-hidden`
 * because the headline + supporting copy
 * already communicate the same story in
 * text. A screen reader should never
 * enumerate "node 1, node 2, node 3".
 *
 * **Idle motion.** A subtle CSS-based
 * pulse on the highlight nodes + a slow
 * `transform` on the entire field. CSS
 * (not GSAP) so the idle state keeps
 * running without re-renders, and the
 * reduced-motion media query naturally
 * disables it.
 */
"use client"

export function HeroVisual() {
  return (
    <div aria-hidden data-testid="hero-visual" className="relative mx-auto w-full max-w-2xl">
      <svg
        viewBox="0 0 600 320"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
        // **F9 Part 1 — visual fix.** The
        // earlier `text-spark` class on the
        // outer SVG set `color: transparent`
        // (it's a text-fill utility). The
        // edge gradient inside the SVG uses
        // `stopColor="currentColor"`, so
        // `transparent` would have made the
        // edges effectively invisible. The
        // nodes survive because they sit
        // inside `<g className="text-foreground">`
        // which overrides `color`. Removing
        // the outer class restores the
        // correct `currentColor` resolution
        // (Ink / Paper depending on theme)
        // and the edge web becomes visible
        // again — the visual that should
        // communicate "connected knowledge"
        // now actually shows its connections.
        className="hero-visual-svg h-auto w-full motion-safe:animate-[hero-field-drift_18s_ease-in-out_infinite]"
      >
        <defs>
          {/* Edge gradient — neutral to ember.
              Mirrors the F6 graph's primary
              path tint (sparingly applied so
              the field still reads as a
              connected whole, not a sale
              banner). */}
          <linearGradient id="hero-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id="hero-edge-highlight" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FF6A3D" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0BE3C4" stopOpacity="0.9" />
          </linearGradient>
          {/* Node radial — solid ember core,
              faded halo. */}
          <radialGradient id="hero-node-halo">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── Edges ──────────────────────────────────────────── */}
        <g stroke="url(#hero-edge)" strokeWidth="1.25" fill="none" className="opacity-70">
          {/* Sweep of straight + slightly curved
              connections. Positioned to form a
              "constellation" rather than a
              rigid grid. */}
          <path d="M70 90 L180 60" />
          <path d="M180 60 L300 110" />
          <path d="M300 110 L420 80" />
          <path d="M420 80 L530 130" />
          <path d="M70 90 L150 180" />
          <path d="M150 180 L260 200" />
          <path d="M260 200 L370 220" />
          <path d="M370 220 L500 240" />
          <path d="M180 60 L260 200" />
          <path d="M300 110 L370 220" />
          <path d="M420 80 L370 220" />
          <path d="M150 180 L300 110" />
          <path d="M260 200 L420 80" />
        </g>

        {/* ── Highlight path ─────────────────────────────────── */}
        {/* The "query" path — the same visual
            grammar the F6 graph uses when a
            question lights up a route. Two
            larger nodes + a thicker gradient
            edge between them. */}
        <line
          x1="180"
          y1="60"
          x2="260"
          y2="200"
          stroke="url(#hero-edge-highlight)"
          strokeWidth="2"
          strokeLinecap="round"
          className="motion-safe:animate-[hero-pulse_3.4s_ease-in-out_infinite]"
        />

        {/* ── Nodes ──────────────────────────────────────────── */}
        {/* Halos (drawn first so they sit
            behind the solid cores). */}
        <g fill="url(#hero-node-halo)">
          <circle cx="70" cy="90" r="14" />
          <circle cx="180" cy="60" r="20" />
          <circle cx="300" cy="110" r="18" />
          <circle cx="420" cy="80" r="20" />
          <circle cx="530" cy="130" r="14" />
          <circle cx="150" cy="180" r="16" />
          <circle cx="260" cy="200" r="22" />
          <circle cx="370" cy="220" r="16" />
          <circle cx="500" cy="240" r="14" />
        </g>

        {/* Solid cores. The two highlight
            nodes (180,60) + (260,200) are
            larger and pulse to suggest
            "this is what a query looks
            like". */}
        <g fill="currentColor" className="text-foreground">
          {NODES.map((n) => (
            <circle key={`${n.x}-${n.y}`} cx={n.x} cy={n.y} r={n.r} opacity={n.opacity} />
          ))}
        </g>
      </svg>
    </div>
  )
}

const NODES: ReadonlyArray<{ x: number; y: number; r: number; opacity: number }> = [
  { x: 70, y: 90, r: 4, opacity: 0.6 },
  { x: 180, y: 60, r: 7, opacity: 1 }, // highlight
  { x: 300, y: 110, r: 6, opacity: 0.85 },
  { x: 420, y: 80, r: 7, opacity: 1 },
  { x: 530, y: 130, r: 4, opacity: 0.6 },
  { x: 150, y: 180, r: 5, opacity: 0.7 },
  { x: 260, y: 200, r: 8, opacity: 1 }, // highlight
  { x: 370, y: 220, r: 5, opacity: 0.7 },
  { x: 500, y: 240, r: 4, opacity: 0.6 },
]
