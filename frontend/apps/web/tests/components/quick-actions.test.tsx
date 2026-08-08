/**
 * QuickActionCard / QuickActions — F3 Part 1 (Task 8).
 *
 * Verifies:
 *   - Live card has an enabled button that calls the
 *     supplied onAction.
 *   - Coming-soon card is disabled + has a "Soon" pill.
 *   - QuickActions lays out all three cards in the spec.
 */

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { QuickActions } from "@/components/dashboard/QuickActions"
import { QuickActionCard } from "@/components/dashboard/QuickActionCard"

describe("QuickActionCard", () => {
  it("live card fires onAction on click", () => {
    const onAction = vi.fn()
    render(
      <QuickActionCard
        title="Upload Document"
        description="Drop a file"
        icon="Upload"
        actionLabel="Upload"
        onAction={onAction}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /upload/i }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it("coming-soon card is disabled + has a 'Soon' pill", () => {
    render(
      <QuickActionCard
        title="Search Knowledge"
        description="Hybrid search"
        icon="Search"
        actionLabel="Search"
        variant="coming-soon"
      />,
    )
    const button = screen.getByRole("button", { name: /search/i })
    expect(button).toBeDisabled()
    expect(screen.getByText(/^soon$/i)).toBeInTheDocument()
  })
})

describe("QuickActions", () => {
  it("renders Upload (live) + Ask Cortex (live) + Create Agent (Soon)", () => {
    render(<QuickActions />)
    expect(screen.getByText(/upload document/i)).toBeInTheDocument()
    // F4 Part 1: "Search Knowledge" was replaced
    // by the "Ask Cortex" CTA (the F4 chat entry
    // point).
    expect(screen.getByText(/ask cortex/i)).toBeInTheDocument()
    expect(screen.getByText(/create agent/i)).toBeInTheDocument()
    // F4 Part 1: only "Create Agent" is still
    // coming-soon — "Search Knowledge" is gone
    // and "Ask Cortex" is live.
    expect(screen.getAllByText(/^soon$/i).length).toBe(1)
  })
})
