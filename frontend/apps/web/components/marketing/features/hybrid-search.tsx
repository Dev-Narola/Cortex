/**
 * HybridSearchSection — the F8 marketing
 * "Hybrid Search" feature beat.
 *
 * **F8 Part 2.** The first real technical
 * feature story. The marketing message is
 * exactly what the engineering blueprint
 * says:
 *
 *   Keyword search     ─┐
 *                       ├─→ Fusion ─→ Rerank ─→ Best context
 *   Semantic search    ─┘
 *
 * Not "AI magic". The visitor learns that
 * Cortex depends on **two complementary
 * retrieval strategies** plus a
 * reranking step — which is the actual
 * differentiator vs. the simplistic
 * `query → vector DB → LLM` story.
 *
 * **Composition.** Built on top of the
 * reusable `<FeatureSection />` wrapper
 * (shared with the future Knowledge
 * Graph, Agents+MCP, and Citations
 * sections). The wrapper owns the
 * text-column fade-up; this section
 * owns the technical visual.
 */
import { FeatureSection } from "./feature-section"
import { HybridSearchVisual } from "./hybrid-search-visual"

export function HybridSearchSection() {
  return (
    <FeatureSection
      id="hybrid-search"
      eyebrow="Hybrid Search"
      title="Find what matches the words — and what matches the meaning."
      description={
        <>
          Cortex combines <strong>keyword search</strong> (Postgres
          full-text) with <strong>vector similarity</strong>{" "}
          (pgvector), fuses the two result lists with reciprocal
          rank fusion, then reranks the candidates with a
          cross-encoder — so the answer is grounded in the right
          source, every time.
        </>
      }
      visual={<HybridSearchVisual />}
    />
  )
}
