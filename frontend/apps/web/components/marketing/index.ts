/**
 * Marketing components — barrel.
 *
 * F8. The Settings landing page imports
 * from here.
 */

export { MarketingHeader } from "./marketing-header"
export { HeroSection } from "./hero/hero-section"
export { HeroBackground } from "./hero/hero-background"
export { HeroVisual } from "./hero/hero-visual"
export { ProblemSection } from "./problem/problem-section"
export { SolutionSection } from "./solution/solution-section"
export { FeatureSection } from "./features/feature-section"
export { HybridSearchSection } from "./features/hybrid-search"
export { HybridSearchVisual } from "./features/hybrid-search-visual"
export { KnowledgeGraphSection } from "./features/knowledge-graph"
export { KnowledgeGraphVisual } from "./features/knowledge-graph-visual"
export { AgentsMcpSection } from "./features/agents-mcp"
export { AgentsMcpVisual } from "./features/agents-mcp-visual"
export { CitationsSection } from "./features/citations"
export { CitationsVisual } from "./features/citations-visual"
export { LiveDemoSection } from "./demo/live-demo-section"
export { DemoChat } from "./demo/demo-chat"
export { DemoInput } from "./demo/demo-input"
export { DemoMessage } from "./demo/demo-message"
export { DemoQuestionChips } from "./demo/demo-question-chips"
export { DemoSourcePanel } from "./demo/demo-source-panel"
export { DemoCitation as DemoCitationChip } from "./demo/demo-citation"
export { useDemoStream } from "./demo/demo-stream"
export {
  DEMO_ENTRIES,
  getSeededDemo,
  parseAnswer,
  type DemoEntry,
  type DemoCitation,
  type AnswerSegment,
} from "./demo/demo-data"
// F8 Part 5 — the closing trio of the
// marketing page: the quiet technical
// strip, the final CTA, and the footer.
export { TechnicalCredibility } from "./technical-credibility"
export { FinalCTA } from "./final-cta"
export { Footer } from "./footer"
