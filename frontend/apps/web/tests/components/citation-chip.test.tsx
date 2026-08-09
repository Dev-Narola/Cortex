/**
 * CitationChip — F4 Part 3 (Tasks 41, 42, 61).
 *
 * Covers:
 *   - Renders the index as the visible
 *     label ([1], [2], …).
 *   - Click + Enter / Space open the
 *     panel via the citationPanelStore.
 *   - The aria-label includes the index
 *     AND the document title (when
 *     provided) so a screen reader
 *     announces "View source citation 1,
 *     Cortex architecture document"
 *     instead of just "1".
 *   - `aria-pressed` reflects whether
 *     this chip is the active selection.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { CitationChip } from "@/components/chat/citations/CitationChip"
import { useCitationPanelStore } from "@/hooks/chat/citationPanelStore"

beforeEach(() => {
  useCitationPanelStore.getState().reset()
})

afterEach(() => {
  useCitationPanelStore.getState().reset()
})

describe("CitationChip (Tasks 41, 42, 61)", () => {
  it("renders the index as the visible label", () => {
    render(
      <CitationChip id="citation:chunk-1" index={1} />,
    )
    const chip = screen.getByRole("button", { name: /view source citation 1/i })
    expect(chip).toBeInTheDocument()
    expect(chip.textContent).toBe("1")
  })

  it("includes the document title in the aria-label when provided", () => {
    render(
      <CitationChip
        id="citation:chunk-1"
        index={3}
        documentTitle="Cortex architecture document"
      />,
    )
    const chip = screen.getByRole("button", {
      name: /view source citation 3, cortex architecture document/i,
    })
    expect(chip).toBeInTheDocument()
  })

  it("opens the citation panel on click", async () => {
    const user = userEvent.setup()
    render(<CitationChip id="citation:chunk-1" index={1} />)
    const chip = screen.getByRole("button", { name: /view source citation 1/i })
    await user.click(chip)
    const state = useCitationPanelStore.getState()
    expect(state.selectedCitationId).toBe("citation:chunk-1")
    expect(state.isOpen).toBe(true)
  })

  it("opens the citation panel on Enter", async () => {
    const user = userEvent.setup()
    render(<CitationChip id="citation:chunk-1" index={1} />)
    const chip = screen.getByRole("button", { name: /view source citation 1/i })
    chip.focus()
    await user.keyboard("{Enter}")
    const state = useCitationPanelStore.getState()
    expect(state.selectedCitationId).toBe("citation:chunk-1")
    expect(state.isOpen).toBe(true)
  })

  it("opens the citation panel on Space", async () => {
    const user = userEvent.setup()
    render(<CitationChip id="citation:chunk-1" index={1} />)
    const chip = screen.getByRole("button", { name: /view source citation 1/i })
    chip.focus()
    await user.keyboard(" ")
    const state = useCitationPanelStore.getState()
    expect(state.selectedCitationId).toBe("citation:chunk-1")
    expect(state.isOpen).toBe(true)
  })

  it("reflects the active selection via aria-pressed", () => {
    useCitationPanelStore.getState().open("citation:chunk-1")
    render(<CitationChip id="citation:chunk-1" index={1} />)
    const chip = screen.getByRole("button", { name: /view source citation 1/i })
    expect(chip).toHaveAttribute("aria-pressed", "true")
  })

  it("aria-pressed is false when this chip is not the active selection", () => {
    useCitationPanelStore.getState().open("citation:chunk-OTHER")
    render(<CitationChip id="citation:chunk-1" index={1} />)
    const chip = screen.getByRole("button", { name: /view source citation 1/i })
    expect(chip).toHaveAttribute("aria-pressed", "false")
  })
})
