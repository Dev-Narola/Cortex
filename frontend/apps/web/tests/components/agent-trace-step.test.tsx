/**
 * AgentTraceStep — F5 Part 3.
 *
 * Renders one tool-call row inside the trace
 * stepper. The tests cover:
 *   - tool name in mono
 *   - result summary
 *   - latency formatting (delegated to
 *     formatLatency)
 *   - long names / summaries wrap
 *   - last-step connector suppression
 *   - error variant swaps the icon and shows
 *     the error string
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AgentTraceStep } from "@/components/chat/agents/AgentTraceStep"

describe("AgentTraceStep", () => {
  it("renders the tool name in mono", () => {
    render(
      <ul>
        <AgentTraceStep
          name="retrieve_documents"
          resultSummary="5 chunks"
          latencyMs={420}
          index={1}
        />
      </ul>,
    )
    const name = screen.getByTestId("agent-step-name")
    expect(name.textContent).toBe("retrieve_documents")
    // The Mono class lives on the parent <span>
    // that wraps the name + icon; walk up one
    // level to assert it.
    const parent = name.parentElement
    expect(parent?.tagName.toLowerCase()).toBe("span")
    expect(parent?.className).toContain("font-mono")
  })

  it("renders the result summary and latency", () => {
    render(
      <ul>
        <AgentTraceStep
          name="retrieve_documents"
          resultSummary="Found 5 relevant chunks"
          latencyMs={420}
          index={1}
        />
      </ul>,
    )
    expect(screen.getByTestId("agent-step-summary").textContent).toBe(
      "Found 5 relevant chunks",
    )
    expect(screen.getByTestId("agent-step-latency").textContent).toBe(
      "420ms",
    )
  })

  it("formats latency in seconds for >= 1000ms", () => {
    render(
      <ul>
        <AgentTraceStep
          name="generate_answer"
          resultSummary="Done"
          latencyMs={1200}
          index={1}
        />
      </ul>,
    )
    expect(screen.getByTestId("agent-step-latency").textContent).toBe(
      "1.2s",
    )
  })

  it("shows the em-dash when latency is null", () => {
    render(
      <ul>
        <AgentTraceStep
          name="search_knowledge_graph"
          resultSummary="did not finish"
          latencyMs={null}
          index={1}
        />
      </ul>,
    )
    expect(screen.getByTestId("agent-step-latency").textContent).toBe(
      "—",
    )
  })

  it("renders error message instead of summary when status is error", () => {
    render(
      <ul>
        <AgentTraceStep
          name="search_knowledge_graph"
          resultSummary="Tool failed"
          latencyMs={200}
          status="error"
          error="graph offline"
          index={1}
        />
      </ul>,
    )
    // When the call failed, the summary line shows
    // the error string, not the result summary.
    expect(screen.getByTestId("agent-step-summary").textContent).toBe(
      "graph offline",
    )
    expect(
      screen.getByRole("listitem", {
        name: undefined,
      }),
    ).toHaveAttribute("data-step-status", "error")
  })

  it("uses isLast to suppress the trailing connector", () => {
    const { container } = render(
      <ul>
        <AgentTraceStep
          name="a"
          resultSummary="x"
          latencyMs={100}
          index={1}
        />
        <AgentTraceStep
          name="b"
          resultSummary="y"
          latencyMs={100}
          index={2}
          isLast
        />
      </ul>,
    )
    // The last step renders only the dot; the
    // connector line is suppressed.
    const items = container.querySelectorAll("li")
    expect(items.length).toBe(2)
    // The first step has a connecting line; the
    // second does not. We can detect via the
    // aria-hidden span count: each step has a
    // dot span; non-last steps add a connector
    // span.
    const step1 = items[0]
    const step2 = items[1]
    if (!step1 || !step2) throw new Error("expected 2 list items")
    const connectors1 = step1.querySelectorAll(
      "span[aria-hidden='true']",
    )
    const connectors2 = step2.querySelectorAll(
      "span[aria-hidden='true']",
    )
    expect(connectors1.length).toBeGreaterThan(connectors2.length)
  })

  it("renders long tool names without overflow", () => {
    const longName =
      "search_knowledge_base_with_metadata_filter"
    render(
      <ul>
        <AgentTraceStep
          name={longName}
          resultSummary="3 results"
          latencyMs={120}
          index={1}
        />
      </ul>,
    )
    const name = screen.getByTestId("agent-step-name")
    expect(name.textContent).toBe(longName)
    // The Mono span carries break-all so the
    // name wraps instead of pushing the
    // latency off-screen.
    expect(name.className).toContain("break-all")
  })

  it("renders the generate_answer step without a warning icon", () => {
    const { container } = render(
      <ul>
        <AgentTraceStep
          name="generate_answer"
          resultSummary="Final response"
          latencyMs={300}
          index={1}
        />
      </ul>,
    )
    // The TriangleAlert is for error steps. The
    // generate_answer step uses the terminal
    // glyph instead. The simplest way to assert
    // no error treatment is the data-step-status
    // attribute defaults to "ok".
    expect(
      container.querySelector("[data-step-status='error']"),
    ).toBeNull()
  })
})
