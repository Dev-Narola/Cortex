/**
 * CitationsSection — the F8 marketing
 * "Citations / Trust" feature beat.
 *
 * **F8 Part 3.** The fourth of the four
 * feature beats. The marketing message:
 *
 *   Every important answer should be
 *   traceable back to the source that
 *   supports it.
 *
 * Per the F8 spec, this section is one of
 * the most important trust sections:
 * "Avoid generic 'AI you can trust'. That
 * claim is too broad. Instead demonstrate
 * *why* the answer can be trusted."
 *
 * The visual is the honest preview: an
 * answer with a citation marker, the
 * marker connected to a source card with
 * the document name + section/page. No
 * "Trusted AI" badge — just traceability.
 *
 * **Composition.** Built on the reusable
 * `<FeatureSection />` wrapper with:
 * - The Spark-gradient icon.
 * - The CitationsVisual.
 * - `reverse` set so the visual appears on
 *   the LEFT and the text on the RIGHT
 *   (matching the Knowledge Graph
 *   [visual|text] alternation pattern).
 */
import { Quote } from "lucide-react"

import { CitationsVisual } from "./citations-visual"
import { FeatureSection } from "./feature-section"

export function CitationsSection() {
  return (
    <FeatureSection
      id="citations"
      eyebrow="Citations"
      title="Every answer comes from somewhere."
      description={
        <>
          Cortex cites the source behind every important claim. The
          citation marker in the answer traces directly to the
          document, section, and page that{" "}
          <strong>actually supports it</strong> — so a sceptical
          reader can verify the answer in one click, not by reading
          the whole knowledge base.
        </>
      }
      icon={<Quote className="h-5 w-5" aria-hidden />}
      visual={<CitationsVisual />}
      reverse
    />
  )
}
