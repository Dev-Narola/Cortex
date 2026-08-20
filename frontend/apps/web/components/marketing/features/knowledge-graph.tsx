/**
 * KnowledgeGraphSection — the F8 marketing
 * "Knowledge Graph" feature beat.
 *
 * **F8 Part 3.** The second of the four
 * feature beats. The marketing message is
 * that Cortex doesn't just retrieve chunks
 * — it understands the relationships
 * between entities in your knowledge.
 *
 * **Composition.** Built on the reusable
 * `<FeatureSection />` wrapper (F8 P2)
 * with:
 * - The Spark-gradient icon (per the F8
 *   spec: "The four marketing feature icons
 *   should use the Spark gradient, while
 *   normal application icons remain
 *   Lucide").
 * - The KnowledgeGraphVisual (the abstract
 *   entity-relationship graph).
 * - `reverse` set so the visual appears on
 *   the LEFT and the text on the RIGHT
 *   (alternating with Hybrid Search's
 *   text-left layout — per the F8 rhythm
 *   rule: "Hybrid Search: [text] [visual];
 *   Knowledge Graph: [visual] [text]").
 */
import { Network } from "lucide-react"

import { FeatureSection } from "./feature-section"
import { KnowledgeGraphVisual } from "./knowledge-graph-visual"

export function KnowledgeGraphSection() {
  return (
    <FeatureSection
      id="knowledge-graph"
      eyebrow="Knowledge Graph"
      title="Connect the knowledge behind the answer."
      description={
        <>
          Cortex extracts entities and relationships from your
          documents as you upload — people, concepts, projects,
          technologies. Retrieval can then traverse the graph
          instead of returning isolated chunks, so the answer
          reflects the <strong>connected context</strong>, not just
          the closest paragraph.
        </>
      }
      icon={<Network className="h-5 w-5" aria-hidden />}
      visual={<KnowledgeGraphVisual />}
      reverse
    />
  )
}
