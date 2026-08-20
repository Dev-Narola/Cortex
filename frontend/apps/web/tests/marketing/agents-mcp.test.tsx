/**
 * AgentsMcpSection — F8 Part 3.
 *
 * Tests the Agents + MCP feature section:
 *   - The eyebrow + heading + description
 *     render.
 *   - The description mentions MCP and
 *     tool-calling (the actual Cortex
 *     agentic capability).
 *   - The icon is present (Spark-gradient
 *     treatment).
 *   - The trace visual is decorative
 *     (`aria-hidden`).
 *   - All 6 trace stages render (Request,
 *     Agent, Plan, Retrieve, Tool, Result).
 *   - The "Tool" stage carries the "via MCP"
 *     detail (the marketing explanation of
 *     MCP).
 *   - The visual starts in the idle state.
 *   - The section has a stable id.
 *   - **No specific vendor claims** — the
 *     description does NOT name Slack,
 *     Notion, GitHub, etc. (per the F8
 *     spec).
 */

import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AgentsMcpSection } from "@/components/marketing/features/agents-mcp"
import { AgentsMcpVisual } from "@/components/marketing/features/agents-mcp-visual"

describe("AgentsMcpSection", () => {
  it("renders the eyebrow + heading", () => {
    render(<AgentsMcpSection />)
    expect(screen.getByText(/agents \+ mcp/i)).toBeInTheDocument()
    const h2 = screen.getByRole("heading", { level: 2 })
    expect(h2).toHaveTextContent(/from knowledge to action/i)
  })

  it("the description mentions MCP and tool-calling", () => {
    render(<AgentsMcpSection />)
    const text = screen.getByTestId("agents-text")
    // The "Model Context Protocol" name
    // is the actual product surface (per
    // the V8 implementation).
    expect(within(text).getByText(/model context protocol/i)).toBeInTheDocument()
    // "Tool-calling" / "call external tools"
    // is the marketing explanation of
    // the agentic capability.
    expect(within(text).getByText(/call external tools/i)).toBeInTheDocument()
  })

  it("the description does NOT claim specific vendor integrations", () => {
    // Per the F8 spec: "Don't claim
    // integrations that Cortex does not
    // actually support... Use generic
    // 'service' / 'tool' rather than
    // 'Slack / Notion / GitHub' etc."
    render(<AgentsMcpSection />)
    const text = screen.getByTestId("agents-text")
    const textContent = text.textContent?.toLowerCase() ?? ""
    for (const vendor of ["slack", "notion", "github", "jira", "salesforce", "google drive"]) {
      expect(textContent).not.toContain(vendor)
    }
  })

  it("renders the icon in the Spark-gradient treatment", () => {
    render(<AgentsMcpSection />)
    const icon = screen.getByTestId("agents-icon")
    expect(icon).toBeInTheDocument()
    expect(icon.className).toMatch(/bg-spark/)
  })

  it("renders the visual and marks it decorative", () => {
    render(<AgentsMcpSection />)
    const visual = screen.getByTestId("agents-mcp-visual")
    expect(visual).toBeInTheDocument()
    expect(visual).toHaveAttribute("aria-hidden", "true")
  })

  it("has a stable id for the marketing nav", () => {
    const { container } = render(<AgentsMcpSection />)
    const section = container.querySelector("section#agents")
    expect(section).not.toBeNull()
  })
})

describe("AgentsMcpVisual", () => {
  it("renders all 6 trace stages", () => {
    render(<AgentsMcpVisual />)
    expect(screen.getByTestId("agents-mcp-stage-request")).toBeInTheDocument()
    expect(screen.getByTestId("agents-mcp-stage-agent")).toBeInTheDocument()
    expect(screen.getByTestId("agents-mcp-stage-plan")).toBeInTheDocument()
    expect(screen.getByTestId("agents-mcp-stage-retrieve")).toBeInTheDocument()
    expect(screen.getByTestId("agents-mcp-stage-tool")).toBeInTheDocument()
    expect(screen.getByTestId("agents-mcp-stage-result")).toBeInTheDocument()
  })

  it("the 'Tool' stage carries the 'via MCP' detail", () => {
    render(<AgentsMcpVisual />)
    const tool = screen.getByTestId("agents-mcp-stage-tool")
    expect(within(tool).getByText(/via mcp/i)).toBeInTheDocument()
  })

  it("the 'Tool' stage uses the Spark-gradient accent (the 'active' step)", () => {
    render(<AgentsMcpVisual />)
    const tool = screen.getByTestId("agents-mcp-stage-tool")
    // The accent is on the label.
    const label = within(tool).getByText("Tool")
    expect(label.className).toMatch(/text-spark/)
  })

  it("starts in the idle state (data-revealed='false')", () => {
    render(<AgentsMcpVisual />)
    const visual = screen.getByTestId("agents-mcp-visual")
    expect(visual).toHaveAttribute("data-revealed", "false")
  })

  it("the final state is understandable without the animation", () => {
    // All 6 stages are in the DOM from
    // first paint; reduced-motion users
    // see the entire trace at once.
    render(<AgentsMcpVisual />)
    const labels = ["Request", "Agent", "Plan", "Retrieve", "Tool", "Result"]
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})
