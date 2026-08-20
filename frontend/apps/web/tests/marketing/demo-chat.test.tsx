/**
 * DemoChat — F8 Part 4.
 *
 * Tests the orchestrator's state machine:
 *   - Idle state shows the empty state.
 *   - Clicking a chip auto-submits and
 *     drives the streaming.
 *   - The answer appears progressively.
 *   - The citation chip is clickable and
 *     opens the source panel.
 *   - The source panel shows the document
 *     title + location + excerpt.
 *   - Clicking another question resets
 *     the demo.
 *
 * Uses fake timers + the streaming hook's
 * `CHUNK_INTERVAL_MS` (45ms). After each
 * user action we advance enough time for
 * the entire stream to complete.
 */

import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DemoChat } from "@/components/marketing/demo/demo-chat"

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("DemoChat", () => {
  it("starts in the idle state with the empty state visible", () => {
    render(<DemoChat />)
    expect(screen.getByTestId("demo-empty-state")).toBeInTheDocument()
    expect(screen.getByText(/Ask Cortex a question/i)).toBeInTheDocument()
  })

  it("renders all 3 example chips", () => {
    render(<DemoChat />)
    // Each seeded entry has a chip;
    // check by testid rather than text
    // (the chip labels include specific
    // copy that may evolve over time).
    expect(screen.getByTestId("demo-chip-hybrid-search")).toBeInTheDocument()
    expect(screen.getByTestId("demo-chip-knowledge-graph")).toBeInTheDocument()
    expect(screen.getByTestId("demo-chip-citations")).toBeInTheDocument()
  })

  it("clicking a chip auto-submits and reveals the answer progressively", () => {
    render(<DemoChat />)
    // Click the first chip.
    fireEvent.click(screen.getByTestId("demo-chip-hybrid-search"))
    // The empty state disappears and
    // the message appears immediately
    // (synchronously — the streaming
    // begins on the next tick).
    expect(screen.queryByTestId("demo-empty-state")).toBeNull()
    expect(screen.getByTestId("demo-message")).toBeInTheDocument()
    // Advance enough time for the
    // entire stream to complete.
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    // The message is no longer
    // streaming.
    expect(screen.getByTestId("demo-message")).toHaveAttribute(
      "data-streaming",
      "false",
    )
    // The answer contains the expected
    // text.
    const text = screen.getByTestId("demo-message-text")
    expect(text.textContent).toMatch(/Cortex/)
    expect(text.textContent).toMatch(/keyword/)
    expect(text.textContent).toMatch(/semantic/)
  })

  it("clicking a citation chip opens the source panel with the document", () => {
    render(<DemoChat />)
    fireEvent.click(screen.getByTestId("demo-chip-hybrid-search"))
    // Let the stream finish.
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    // The first citation in the
    // hybrid-search entry has id
    // `hybrid-1`.
    fireEvent.click(screen.getByTestId("demo-citation-hybrid-1"))
    // The source panel renders the
    // document title + location + excerpt.
    expect(
      screen.getByTestId("demo-source-title-hybrid-1"),
    ).toBeInTheDocument()
    expect(screen.getByTestId("demo-source-title-hybrid-1")).toHaveTextContent(
      /Retrieval Notes\.md/i,
    )
    expect(
      screen.getByTestId("demo-source-excerpt-hybrid-1"),
    ).toBeInTheDocument()
  })

  it("clicking another question resets the demo (no chunks from the previous Q)", () => {
    render(<DemoChat />)
    // Ask the first question.
    fireEvent.click(screen.getByTestId("demo-chip-hybrid-search"))
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    const firstText = screen.getByTestId("demo-message-text").textContent
    expect(firstText).toMatch(/keyword/i)

    // Ask a different question.
    fireEvent.click(screen.getByTestId("demo-chip-knowledge-graph"))
    // Advance enough for the new
    // stream to complete.
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    const secondText = screen.getByTestId("demo-message-text").textContent
    // The new text should be from the
    // knowledge-graph entry, not the
    // hybrid-search one.
    expect(secondText).toMatch(/entities/i)
    expect(secondText).not.toMatch(/keyword/i)
  })

  it("clicking the same citation twice toggles the source panel closed", () => {
    render(<DemoChat />)
    fireEvent.click(screen.getByTestId("demo-chip-hybrid-search"))
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    // Open.
    fireEvent.click(screen.getByTestId("demo-citation-hybrid-1"))
    expect(
      screen.getByTestId("demo-source-title-hybrid-1"),
    ).toBeInTheDocument()
    // Click the same chip again — the
    // panel closes.
    fireEvent.click(screen.getByTestId("demo-citation-hybrid-1"))
    expect(
      screen.queryByTestId("demo-source-title-hybrid-1"),
    ).not.toBeInTheDocument()
  })

  it("does not start a new stream while one is in progress", () => {
    render(<DemoChat />)
    fireEvent.click(screen.getByTestId("demo-chip-hybrid-search"))
    // While streaming, the input + chips
    // are disabled.
    const submit = screen.getByTestId("demo-submit")
    expect(submit).toBeDisabled()
    expect(screen.getByTestId("demo-chip-hybrid-search")).toBeDisabled()
  })
})
