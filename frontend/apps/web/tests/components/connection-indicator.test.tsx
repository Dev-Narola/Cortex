/**
 * ConnectionIndicator — V11.5 polling fallback state.
 *
 * The original F3 Part 4 indicator only needed to
 * surface the WebSocket connection state. The
 * V11.5 polling fallback added a new ``"polling"``
 * state that the hook surfaces when the WebSocket
 * is down but the document list is being kept
 * fresh via list-query refetch. This test pins:
 *
 *   1. Each WebSocket state renders the right
 *      label + dot colour.
 *   2. The new ``"polling"`` state renders
 *      "Polling…" (not "Offline") so the user
 *      can tell the difference between "the
 *      channel is fully offline" and "the
 *      channel is offline but we're still
 *      getting updates via polling".
 *   3. The ``"idle"`` state is hidden (the
 *      page just mounted; the indicator
 *      shouldn't flash a state before the
 *      first transition).
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ConnectionIndicator } from "@/components/documents/ConnectionIndicator"

describe("ConnectionIndicator", () => {
  it("renders 'Live' for the open state with a success dot", () => {
    const { container } = render(<ConnectionIndicator state="open" />)
    expect(screen.getByText("Live")).toBeInTheDocument()
    // The success dot is the first inline span.
    const dot = container.querySelector("span span") as HTMLElement
    expect(dot.className).toContain("bg-success")
  })

  it("renders 'Connecting…' for the connecting state with a pulsing warning dot", () => {
    const { container } = render(
      <ConnectionIndicator state="connecting" />,
    )
    expect(screen.getByText("Connecting…")).toBeInTheDocument()
    const dot = container.querySelector("span span") as HTMLElement
    expect(dot.className).toContain("bg-warning")
    expect(dot.className).toContain("animate-pulse")
  })

  it("renders 'Closing…' for the closing state with a warning dot", () => {
    const { container } = render(<ConnectionIndicator state="closing" />)
    expect(screen.getByText("Closing…")).toBeInTheDocument()
    const dot = container.querySelector("span span") as HTMLElement
    expect(dot.className).toContain("bg-warning")
    expect(dot.className).not.toContain("animate-pulse")
  })

  it("renders 'Offline' for the closed state with a muted dot", () => {
    const { container } = render(<ConnectionIndicator state="closed" />)
    expect(screen.getByText("Offline")).toBeInTheDocument()
    const dot = container.querySelector("span span") as HTMLElement
    expect(dot.className).toContain("bg-muted-foreground")
  })

  it("V11.5 — renders 'Polling…' for the new polling state with a steady warning dot", () => {
    const { container } = render(<ConnectionIndicator state="polling" />)
    expect(screen.getByText("Polling…")).toBeInTheDocument()
    const dot = container.querySelector("span span") as HTMLElement
    // Steady amber, no pulse — different from
    // the connecting state so the user can tell
    // the difference between "trying to connect"
    // and "polling".
    expect(dot.className).toContain("bg-warning")
    expect(dot.className).not.toContain("animate-pulse")
  })

  it("does not render anything for the idle state", () => {
    const { container } = render(<ConnectionIndicator state="idle" />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText("Idle")).not.toBeInTheDocument()
  })

  it("uses role=status + aria-live=polite so screen readers announce transitions", () => {
    render(<ConnectionIndicator state="polling" />)
    const indicator = screen.getByRole("status")
    expect(indicator).toHaveAttribute("aria-live", "polite")
  })
})
