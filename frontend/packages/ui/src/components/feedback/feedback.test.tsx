/**
 * Feedback primitives — Spinner, Skeleton, Tooltip.
 *
 * F1 Part 4 (Task 37).
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Skeleton } from "./Skeleton"
import { Spinner } from "./Spinner"
import { Tooltip, TooltipProvider, TooltipRoot, TooltipTrigger } from "./Tooltip"

describe("Spinner", () => {
  it("renders as aria-hidden when no label is provided", () => {
    const { container } = render(<Spinner />)
    const svg = container.querySelector("svg")
    expect(svg).toHaveAttribute("aria-hidden", "true")
  })
  it("renders as role=status when a label is provided", () => {
    render(<Spinner label="Loading documents" />)
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading documents")
  })
  it("applies the size axis", () => {
    const { container } = render(<Spinner size="lg" />)
    const svg = container.querySelector("svg")
    // happy-dom doesn't expose className.baseVal reliably; use
    // getAttribute which works across both happy-dom and jsdom.
    expect(svg?.getAttribute("class") ?? "").toMatch(/h-6 w-6/)
  })
})

describe("Skeleton", () => {
  it("renders the default text variant", () => {
    render(<Skeleton data-testid="s" />)
    const s = screen.getByTestId("s")
    expect(s).toHaveAttribute("aria-hidden", "true")
    expect(s.className).toMatch(/h-3 w-full/)
  })
  it("applies the variant axis", () => {
    render(<Skeleton variant="circle" data-testid="s" />)
    expect(screen.getByTestId("s").className).toMatch(/rounded-full/)
  })
  it("honours the custom size override", () => {
    render(<Skeleton variant="circle" size="h-12 w-12" data-testid="s" />)
    expect(screen.getByTestId("s").className).toMatch(/h-12 w-12/)
  })
})

describe("Tooltip", () => {
  it("TooltipRoot convenience wrapper renders a trigger", () => {
    render(
      <TooltipRoot content="Saved">
        <button type="button">Save</button>
      </TooltipRoot>,
    )
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
  })

  it("TooltipProvider renders without crashing", () => {
    const { container } = render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
        </Tooltip>
      </TooltipProvider>,
    )
    expect(container.querySelector("button")).toBeInTheDocument()
  })
})
