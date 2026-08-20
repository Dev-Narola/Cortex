/**
 * TechnicalCredibility — the F8 marketing
 * "Technical Credibility Strip" beat.
 *
 * **F8 Part 5.** The transition moment that
 * turns the page from a *demo* into a
 * *decision*. The spec is explicit:
 *
 *   "a dense, quiet row of facts ... no
 *   animation here."
 *
 * So this component is intentionally the
 * plainest section on the page:
 *
 *   - JetBrains Mono (`font-mono`),
 *     small, `tracking-wide`, restrained
 *     colour.
 *   - Cloud background, Mist text.
 *   - Five facts, separated by middle dots
 *     (no Spark gradient, no glow, no
 *     icons, no logos).
 *   - **No motion at all.** The
 *     `useInView` reveal that every other
 *     section uses is intentionally absent
 *     here. The strip just sits there and
 *     lets the facts speak.
 *
 * **Why a strip, not cards.** The spec
 * warns against turning each fact into a
 * large colorful card. Cards compete with
 * the CTA that's about to follow; a single
 * dense line keeps the page rhythm intact.
 *
 * **Tech-stack honesty.** Only technologies
 * actually used by Cortex are listed. No
 * Kubernetes, Kafka, MongoDB, Pinecone,
 * Elasticsearch, or LangChain (per the
 * engineering blueprint: "don't add
 * technology merely because it is trendy").
 *
 * **Responsive.**
 *   - Desktop: 5 facts in a single row,
 *     separated by middle dots.
 *   - Tablet:  wraps to 2 lines via flex-wrap.
 *   - Mobile:  stack vertically, left-aligned
 *     (mono caption with bullet points).
 *
 * **Public surface.** No auth, no tenant,
 * no fetch. The strip is a dumb presentational
 * component — same rule as the rest of the
 * marketing page.
 */
import { Container } from "@cortex/ui"

const FACTS = [
  "Postgres + pgvector",
  "WebSocket streaming",
  "MCP-native",
  "Hybrid BM25 + vector",
  "Reranked",
] as const

/**
 * Slugify a fact so we can use it as a
 * stable `data-testid` per fact (tests
 * pin the presence + order of every fact
 * individually).
 */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

export function TechnicalCredibility() {
  return (
    <section
      aria-labelledby="tech-credibility-heading"
      data-testid="technical-credibility"
      className="relative border-t border-border/60 bg-background py-10 md:py-12"
    >
      <Container size="lg">
        <h2 id="tech-credibility-heading" className="sr-only">
          Technical stack
        </h2>

        {/*
          Mono caption row. The dot
          separators are a real Unicode
          middle-dot character so the
          visual rhythm survives no-CSS
          rendering (RSS readers, screen
          readers won't see the bullets as
          decorative-only).

          On small screens, the row stacks
          vertically with bullets, so the
          facts remain scannable on a
          360px-wide viewport.
        */}
        <ul
          aria-label="Cortex technical stack"
          className="flex flex-col items-start gap-2 font-mono text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2 sm:text-sm"
        >
          {FACTS.map((fact, i) => {
            const isFirst = i === 0
            const isLast = i === FACTS.length - 1
            return (
              <li
                key={fact}
                data-testid={`tech-fact-${slugify(fact)}`}
                className="flex items-center gap-2 whitespace-nowrap"
              >
                {/* Desktop / tablet separator: middle
                    dot. Hidden on mobile (where the row
                    stacks). Hidden on the first fact
                    either way so we don't lead with
                    a stray dot. */}
                <span aria-hidden className="hidden text-muted-foreground/40 sm:inline">
                  {isFirst ? null : "·"}
                </span>
                {/* Mobile bullet: visible only when
                    stacked (the sm:row layout hides it
                    because the dot above takes over). */}
                <span aria-hidden className="text-muted-foreground/40 sm:hidden">
                  {isFirst ? null : "•"}
                </span>
                <span className="tracking-wide">{fact}</span>
                {/* No trailing separator needed — the
                    separators live at the *start* of each
                    item. This keeps the DOM identical
                    whether or not the row wraps. The
                    last item gets no separator (the
                    logic above uses `isFirst` as the
                    gate, so the last item's leading
                    separator would also be hidden; we
                    rely on visual rhythm, not a visible
                    trailing mark). */}
                {/* Hint: tests pin that no fact is
                    wrapped in a separator element, so
                    future contributors don't try to
                    add a trailing mark by accident. */}
                {isLast ? null : null}
              </li>
            )
          })}
        </ul>
      </Container>
    </section>
  )
}
