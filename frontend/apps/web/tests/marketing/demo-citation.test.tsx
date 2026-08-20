/**
 * DemoCitation — F8 Part 4.
 *
 * Tests the inline citation chip:
 *   - Renders the index as the visible
 *     label.
 *   - Carries the document title in the
 *     aria-label (screen-reader context).
 *   - Clicking fires `onOpen` with the
 *     citation's id.
 *   - The chip reflects `aria-pressed`
 *     based on `isActive`.
 *   - The chip is a real `<button>`.
 */

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DemoCitation } from "@/components/marketing/demo/demo-citation"
import type { DemoCitation as DemoCitationData } from "@/components/marketing/demo/demo-data"

const TEST_CITATION: DemoCitationData = {
  id: "test-1",
  index: 1,
  documentTitle: "Retrieval Notes.md",
  location: "Section: Test",
  excerpt: "Some excerpt text.",
}

describe("DemoCitation", () => {
  it("renders the index as the visible label", () => {
    render(
      <DemoCitation
        citation={TEST_CITATION}
        isActive={false}
        onOpen={vi.fn()}
      />,
    )
    const btn = screen.getByTestId("demo-citation-test-1")
    expect(btn).toHaveTextContent("1")
  })

  it("carries the document title in the aria-label", () => {
    render(
      <DemoCitation
        citation={TEST_CITATION}
        isActive={false}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByTestId("demo-citation-test-1")).toHaveAttribute(
      "aria-label",
      "View source citation 1, Retrieval Notes.md",
    )
  })

  it("falls back to a minimal aria-label when no document title is provided", () => {
    const minimal: DemoCitationData = {
      ...TEST_CITATION,
      documentTitle: "",
    }
    render(
      <DemoCitation citation={minimal} isActive={false} onOpen={vi.fn()} />,
    )
    expect(screen.getByTestId("demo-citation-test-1")).toHaveAttribute(
      "aria-label",
      "View source citation 1",
    )
  })

  it("clicking the chip calls onOpen with the citation id", () => {
    const onOpen = vi.fn()
    render(
      <DemoCitation
        citation={TEST_CITATION}
        isActive={false}
        onOpen={onOpen}
      />,
    )
    fireEvent.click(screen.getByTestId("demo-citation-test-1"))
    expect(onOpen).toHaveBeenCalledWith("test-1")
  })

  it("Enter / Space also activates the chip (keyboard)", () => {
    const onOpen = vi.fn()
    render(
      <DemoCitation
        citation={TEST_CITATION}
        isActive={false}
        onOpen={onOpen}
      />,
    )
    const chip = screen.getByTestId("demo-citation-test-1")
    fireEvent.keyDown(chip, { key: "Enter" })
    expect(onOpen).toHaveBeenCalledWith("test-1")
    fireEvent.keyDown(chip, { key: " " })
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it("aria-pressed reflects isActive", () => {
    const { rerender } = render(
      <DemoCitation
        citation={TEST_CITATION}
        isActive={false}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByTestId("demo-citation-test-1")).toHaveAttribute(
      "aria-pressed",
      "false",
    )
    rerender(
      <DemoCitation
        citation={TEST_CITATION}
        isActive={true}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByTestId("demo-citation-test-1")).toHaveAttribute(
      "aria-pressed",
      "true",
    )
  })
})
