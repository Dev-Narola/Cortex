/**
 * HybridSearchVisual — the "two result
 * lists merge into one ranked stack"
 * animation.
 *
 * **F8 Part 2.** The first real technical
 * feature story. Per the F8 spec:
 *
 * > the hybrid-search section visually
 * > merges two result lists into one as it
 * > enters view.
 *
 * The animation is the marketing
 * explanation of the actual retrieval
 * architecture (per the engineering
 * blueprint: Postgres full-text + pgvector
 * → reciprocal-rank fusion → cross-encoder
 * reranking). It is **not** a
 * marketing-only metaphor — the visual is
 * an honest preview of how the system
 * works.
 *
 * **Three states, one play.**
 *   1. **Keyword results** appear
 *      (left column).
 *   2. **Semantic results** appear
 *      (middle column, slightly offset).
 *   3. Both columns move toward the
 *      centre and the "Fused + reranked"
 *      stack appears on the right.
 *
 * The whole animation runs once on
 * scroll-in (driven by the `useInView`
 * hook from `lib/marketing/animations`).
 * All sub-stages read the `data-revealed`
 * flag via CSS-only transitions — no GSAP
 * timeline here, no per-stage JS.
 *
 * **Reduced motion.** When the user has
 * `prefers-reduced-motion: reduce`, the
 * `useInView` hook fires the reveal
 * immediately (no scroll trigger). The
 * CSS transitions are still subject to
 * the global `* { animation-duration:
 * 0.01ms !important; transition-duration:
 * 0.01ms !important; }` rule in
 * `motion.css` — so the visual lands in
 * its final state (all three columns
 * visible) instantly. The visitor still
 * sees the "two streams become one ranked
 * stack" shape, just without the motion.
 *
 * **Decorative.** Marked `aria-hidden` on
 * the root. The eyebrow + title +
 * description in the FeatureSection
 * wrapper carry the meaning; the visual
 * is reinforcement, not the only source
 * of the message.
 */
"use client"

import { useCallback, useRef } from "react"

import { useInView } from "@/lib/marketing/animations"

interface ResultItem {
  label: string
  tag: "exact" | "semantic" | "fused"
}

const KEYWORD_RESULTS: ReadonlyArray<ResultItem> = [
  { label: "tenant_isolation.md", tag: "exact" },
  { label: "auth_refresh_body.md", tag: "exact" },
  { label: "audit_log.md", tag: "exact" },
]

const SEMANTIC_RESULTS: ReadonlyArray<ResultItem> = [
  { label: "tenant_isolation.md", tag: "semantic" },
  { label: "rls_policies.md", tag: "semantic" },
  { label: "auth_refresh_body.md", tag: "semantic" },
]

// After fusion + reranking, the top
// candidates in their final order.
const FUSED_RESULTS: ReadonlyArray<ResultItem> = [
  { label: "tenant_isolation.md", tag: "fused" },
  { label: "rls_policies.md", tag: "fused" },
  { label: "auth_refresh_body.md", tag: "fused" },
]

export function HybridSearchVisual() {
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
      data-testid="hybrid-search-visual"
      data-revealed="false"
      className="relative mx-auto w-full max-w-2xl"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3">
        {/* ── Column 1: Keyword results ──────────────── */}
        <Column
          label="Keyword"
          items={KEYWORD_RESULTS}
          // Column 1 fades in at ~0–400ms
          // (CSS-only via transition-delay).
          columnClass="transition-all duration-500 ease-out opacity-0 translate-y-3 data-[revealed=true]:opacity-100 data-[revealed=true]:translate-y-0"
        />
        {/* ── Column 2: Semantic results ─────────────── */}
        <Column
          label="Semantic"
          items={SEMANTIC_RESULTS}
          columnClass="transition-all duration-[400ms] ease-out opacity-0 translate-y-3 data-[revealed=true]:opacity-100 data-[revealed=true]:translate-y-0 [transition-delay:250ms]"
        />
        {/* ── Column 3: Fused + reranked result ───────── */}
        <FusedColumn items={FUSED_RESULTS} />
      </div>
      {/* Subtle ground line tying the
          columns together. */}
      <div className="mx-auto mt-6 h-px w-2/3 bg-gradient-to-r from-transparent via-border to-transparent" />
      <p className="mt-3 text-center text-xs uppercase tracking-[0.18em] text-muted-foreground">
        Reranked best context
      </p>
    </div>
  )
}

function Column({
  label,
  items,
  columnClass,
}: {
  label: string
  items: ReadonlyArray<ResultItem>
  columnClass: string
}) {
  return (
    <div
      data-testid={`hybrid-search-column-${label.toLowerCase()}`}
      className={columnClass}
    >
      <div className="rounded-xl border border-border bg-background/80 p-3 backdrop-blur-sm">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <ul className="space-y-1.5">
          {items.map((it) => (
            <ResultRow key={it.label} item={it} />
          ))}
        </ul>
      </div>
    </div>
  )
}

function FusedColumn({ items }: { items: ReadonlyArray<ResultItem> }) {
  return (
    <div
      data-testid="hybrid-search-column-fused"
      className="transition-all duration-500 ease-out opacity-0 translate-y-3 scale-95 data-[revealed=true]:opacity-100 data-[revealed=true]:translate-y-0 data-[revealed=true]:scale-100 [transition-delay:1000ms]"
    >
      <div className="relative rounded-xl border border-ember-500/40 bg-gradient-to-br from-ember-100/40 via-background to-volt-100/40 p-3 shadow-spark">
        {/* "Fused" badge in the top-right. */}
        <span
          aria-hidden
          className="absolute -top-2 right-2 inline-flex items-center rounded-full bg-spark px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-paper-50 shadow-sm"
        >
          Fused + reranked
        </span>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Best context
        </p>
        <ul className="space-y-1.5">
          {items.map((it) => (
            <ResultRow key={it.label} item={it} highlight />
          ))}
        </ul>
      </div>
    </div>
  )
}

function ResultRow({
  item,
  highlight = false,
}: {
  item: ResultItem
  highlight?: boolean
}) {
  return (
    <li
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 font-mono text-xs ${
        highlight
          ? "border-ember-500/40 bg-background/80 text-foreground"
          : "border-border/60 bg-background/60 text-paper-200"
      }`}
      data-testid={`hybrid-search-result-${item.tag}-${item.label.replace(/\W+/g, "-")}`}
    >
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
          item.tag === "fused" ? "bg-spark" : "bg-ember-400/60"
        }`}
      />
      <span className="truncate">{item.label}</span>
    </li>
  )
}
