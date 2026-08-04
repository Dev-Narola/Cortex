/**
 * Checkbox tests — minimum spec from F1 Part 2.
 *
 * Covers: renders, checked + indeterminate states, disabled
 * state, keyboard interaction (Space toggles), ref
 * forwarding, a11y attributes.
 */

import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"

import { Checkbox } from "./Checkbox"

const TestCheckbox = (props: {
  defaultChecked?: boolean
  disabled?: boolean
  checked?: boolean | "indeterminate"
  onCheckedChange?: (checked: boolean) => void
}) => (
  <Checkbox
    aria-label="Accept terms"
    defaultChecked={props.defaultChecked}
    disabled={props.disabled}
    checked={props.checked}
    onCheckedChange={props.onCheckedChange}
  />
)

describe("Checkbox", () => {
  it("renders unchecked by default", () => {
    render(<TestCheckbox />)
    expect(screen.getByRole("checkbox")).not.toBeChecked()
  })

  it("renders the indeterminate state", () => {
    render(<TestCheckbox checked="indeterminate" />)
    expect(screen.getByRole("checkbox")).toHaveAttribute("data-state", "indeterminate")
  })

  it("toggles on Space", async () => {
    const onCheckedChange = vi.fn()
    render(<TestCheckbox onCheckedChange={onCheckedChange} />)
    const cb = screen.getByRole("checkbox")
    cb.focus()
    await userEvent.keyboard(" ")
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it("is disabled when `disabled` is set", () => {
    render(<TestCheckbox disabled />)
    expect(screen.getByRole("checkbox")).toBeDisabled()
  })

  it("forwards ref to the underlying button", () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Checkbox ref={ref} aria-label="Accept" />)
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })
})
