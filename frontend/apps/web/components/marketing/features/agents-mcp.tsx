/**
 * AgentsMcpSection — the F8 marketing
 * "Agents + MCP" feature beat.
 *
 * **F8 Part 3.** The third of the four
 * feature beats. The marketing message:
 *
 *   Cortex doesn't just retrieve — it
 *   reasons. Agents can plan a multi-step
 *   task, call tools, and execute actions.
 *   MCP is the standardized protocol that
 *   connects Cortex to external tools and
 *   services.
 *
 * **Composition.** Built on the reusable
 * `<FeatureSection />` wrapper with:
 * - The Spark-gradient icon.
 * - The AgentsMcpVisual (the sequential
 *   trace).
 * - The default `reverse={false}` (text on
 *   the left, visual on the right) — so
 *   the layout alternates: Hybrid Search
 *   [text|visual], Knowledge Graph
 *   [visual|text], Agents + MCP
 *   [text|visual], Citations [visual|text].
 *
 * **MCP terminology.** Per the F8 spec:
 * "Don't claim integrations that Cortex
 * does not actually support... Use
 * generic 'service' / 'tool' rather than
 * 'Slack / Notion / GitHub' etc." The
 * description names MCP + tool-calling
 * without naming specific vendors.
 */
import { Workflow } from "lucide-react"

import { AgentsMcpVisual } from "./agents-mcp-visual"
import { FeatureSection } from "./feature-section"

export function AgentsMcpSection() {
  return (
    <FeatureSection
      id="agents"
      eyebrow="Agents + MCP"
      title="From knowledge to action."
      description={
        <>
          Agents can plan a multi-step task, retrieve the right
          knowledge, and call external tools through the{" "}
          <strong>Model Context Protocol (MCP)</strong>. The same
          protocol connects Cortex to its own tool registry, so the
          product gets a <strong>standardized, auditable</strong>{" "}
          integration surface — not a one-off per-tool adapter.
        </>
      }
      icon={<Workflow className="h-5 w-5" aria-hidden />}
      visual={<AgentsMcpVisual />}
    />
  )
}
