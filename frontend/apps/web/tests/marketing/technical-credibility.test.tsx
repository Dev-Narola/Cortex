/**
 * TechnicalCredibility — F8 Part 5.
 *
 * Tests the technical strip's surface
 * contract:
 *   - The section exists with the right
 *     testid.
 *   - The five architectural facts
 *     (Postgres + pgvector / WebSocket
 *     streaming / MCP-native / Hybrid BM25
 *     + vector / Reranked) are all
 *     present, in the documented order.
 *   - The typography is mono (JetBrains
 *     Mono via the `font-mono` class).
 *   - No animation hooks (the spec is
 *     explicit: "no animation here").
 *   - No Spark gradient treatment.
 *   - No vendor / fake-tech claims
 *     (Kubernetes, Kafka, MongoDB,
 *     Pinecone, Elasticsearch, LangChain,
 *     etc. are pinned to NOT appear).
 */
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { TechnicalCredibility } from "@/components/marketing/technical-credibility"

describe("TechnicalCredibility", () => {
  it("renders the section with the documented testid", () => {
    render(<TechnicalCredibility />)
    const section = screen.getByTestId("technical-credibility")
    expect(section).toBeInTheDocument()
    expect(section.tagName).toBe("SECTION")
  })

  it("renders all five architectural facts in the documented order", () => {
    render(<TechnicalCredibility />)
    const section = screen.getByTestId("technical-credibility")
    const ul = within(section).getByRole("list")
    const items = within(ul).getAllByRole("listitem")
    expect(items).toHaveLength(5)
    expect(items[0]).toHaveTextContent(/postgres \+ pgvector/i)
    expect(items[1]).toHaveTextContent(/websocket streaming/i)
    expect(items[2]).toHaveTextContent(/mcp-native/i)
    expect(items[3]).toHaveTextContent(/hybrid bm25 \+ vector/i)
    expect(items[4]).toHaveTextContent(/reranked/i)
  })

  it("exposes a stable testid per fact so contributors can target individual items", () => {
    render(<TechnicalCredibility />)
    expect(screen.getByTestId("tech-fact-postgres-pgvector")).toBeInTheDocument()
    expect(screen.getByTestId("tech-fact-websocket-streaming")).toBeInTheDocument()
    expect(screen.getByTestId("tech-fact-mcp-native")).toBeInTheDocument()
    expect(screen.getByTestId("tech-fact-hybrid-bm25-vector")).toBeInTheDocument()
    expect(screen.getByTestId("tech-fact-reranked")).toBeInTheDocument()
  })

  it("uses mono typography (JetBrains Mono via the font-mono utility)", () => {
    render(<TechnicalCredibility />)
    const list = screen.getByRole("list", {
      name: /cortex technical stack/i,
    })
    expect(list.className).toMatch(/font-mono/)
  })

  it("does NOT use the Spark gradient treatment (the strip is intentionally sober)", () => {
    const { container } = render(<TechnicalCredibility />)
    // The strip should not carry the
    // bg-spark or text-spark utility that
    // the hero / CTA / graph edge use.
    const html = container.innerHTML
    expect(html).not.toMatch(/bg-spark/)
    expect(html).not.toMatch(/text-spark/)
  })

  it("does NOT wire up the useInView hook (no animation here, by design)", () => {
    // The strip intentionally has no
    // motion — the spec is explicit:
    // "no animation here." If a future
    // contributor adds an `opacity-0` /
    // `data-revealed` reveal pattern (the
    // shape every other F8 section uses),
    // this test will fail and they'll
    // have to make an explicit decision
    // to override it.
    const { container } = render(<TechnicalCredibility />)
    const list = screen.getByRole("list", {
      name: /cortex technical stack/i,
    })
    expect(list.className).not.toMatch(/opacity-0/)
    expect(list.className).not.toMatch(/translate-y-4/)
    expect(list.dataset.revealed).toBeUndefined()
    // The strip container itself should
    // not be hidden waiting for an
    // intersection observer to fire.
    expect(container.innerHTML).not.toMatch(/data-revealed/)
  })

  it("does NOT claim unsupported technologies", () => {
    // The engineering blueprint is
    // explicit: "don't add technology
    // merely because it is trendy."
    // These are pinned to NOT appear.
    render(<TechnicalCredibility />)
    const section = screen.getByTestId("technical-credibility")
    const text = section.textContent ?? ""
    for (const tech of [
      /kubernetes/i,
      /\bkafka\b/i,
      /mongodb/i,
      /pinecone/i,
      /elasticsearch/i,
      /langchain/i,
      /\bredis\b/i,
    ]) {
      expect(text).not.toMatch(tech)
    }
  })

  it("does NOT show technology logos (text-only facts)", () => {
    // The spec is explicit: "Don't add
    // fake technology logos. Text is
    // enough."
    const { container } = render(<TechnicalCredibility />)
    const svgs = container.querySelectorAll("svg")
    // No inline brand logos. (The Mono
    // dot is a CSS-styled span, not an
    // SVG.)
    expect(svgs).toHaveLength(0)
    // No img elements either.
    expect(container.querySelectorAll("img")).toHaveLength(0)
  })

  it("is a landmark section with an accessible heading", () => {
    render(<TechnicalCredibility />)
    // The heading is visually hidden but
    // available to screen readers (the
    // strip is text-only, so the heading
    // is a single sr-only h2).
    const heading = screen.getByRole("heading", { level: 2, hidden: true })
    expect(heading).toHaveTextContent(/technical stack/i)
  })
})
