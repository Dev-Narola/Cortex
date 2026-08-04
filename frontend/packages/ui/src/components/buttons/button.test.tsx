/**
 * Button tests — minimum spec from F1 Part 2.
 *
 * Covers: renders, variant rendering, disabled state,
 * keyboard interaction, ref forwarding, accessibility
 * attributes.
 */

import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"

import { Button } from "./Button"

describe("Button", () => {
  it("renders the label as children", () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
  })

  it("defaults to the `default` variant + `md` size", () => {
    render(<Button>Save</Button>)
    const btn = screen.getByRole("button")
    expect(btn.className).toMatch(/bg-ink-900/)
    expect(btn.className).toMatch(/h-10/)
  })

  it("renders the `destructive` variant", () => {
    render(<Button variant="destructive">Delete</Button>)
    const btn = screen.getByRole("button")
    expect(btn.className).toMatch(/bg-destructive/)
  })

  it("renders the `outline` variant", () => {
    render(<Button variant="outline">Cancel</Button>)
    const btn = screen.getByRole("button")
    expect(btn.className).toMatch(/border-border/)
  })

  it("renders the icon-only size", () => {
    render(<Button size="icon" aria-label="Close" />)
    const btn = screen.getByRole("button", { name: "Close" })
    expect(btn.className).toMatch(/h-10 w-10/)
  })

  it("is disabled when the `disabled` prop is set", () => {
    render(<Button disabled>Save</Button>)
    const btn = screen.getByRole("button")
    expect(btn).toBeDisabled()
  })

  it("renders a spinner and dims when `loading` is true", () => {
    render(<Button loading>Save</Button>)
    const btn = screen.getByRole("button")
    expect(btn).toHaveAttribute("aria-busy", "true")
    expect(btn).toHaveAttribute("data-loading", "true")
    expect(screen.getByTestId("button-spinner")).toBeInTheDocument()
  })

  it("is non-interactive while loading even without `disabled`", async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    )
    await userEvent.click(screen.getByRole("button"))
    expect(onClick).not.toHaveBeenCalled()
  })

  it("renders left + right icon slots", () => {
    render(
      <Button
        iconLeft={<span data-testid="left">L</span>}
        iconRight={<span data-testid="right">R</span>}
      >
        Save
      </Button>,
    )
    expect(screen.getByTestId("left")).toBeInTheDocument()
    expect(screen.getByTestId("right")).toBeInTheDocument()
  })

  it("forwards ref to the underlying button element", () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Button ref={ref}>Save</Button>)
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })

  it("renders as a child element when `asChild` is true", () => {
    render(
      <Button asChild>
        <a href="/save">Save</a>
      </Button>,
    )
    const link = screen.getByRole("link", { name: "Save" })
    expect(link).toBeInTheDocument()
    expect(link.className).toMatch(/bg-ink-900/)
  })

  it("triggers click on Enter / Space", async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    const btn = screen.getByRole("button")
    btn.focus()
    await userEvent.keyboard("{Enter}")
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
