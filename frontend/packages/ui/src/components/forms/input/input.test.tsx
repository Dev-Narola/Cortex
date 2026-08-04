/**
 * Input tests — minimum spec from F1 Part 2.
 *
 * Covers: renders, variant rendering (state), disabled,
 * readOnly, error / aria-invalid, ref forwarding, prefix
 * + suffix + clearable slots.
 */

import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createRef } from "react"
import { describe, expect, it } from "vitest"

import { Input } from "./Input"

describe("Input", () => {
  it("renders as a text input by default", () => {
    render(<Input placeholder="Email" />)
    const input = screen.getByPlaceholderText("Email")
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute("type", "text")
  })

  it("renders a different `type` (email / password / search / number / url)", () => {
    const { rerender } = render(<Input type="email" data-testid="i" />)
    expect(screen.getByTestId("i")).toHaveAttribute("type", "email")
    rerender(<Input type="password" data-testid="i" />)
    expect(screen.getByTestId("i")).toHaveAttribute("type", "password")
    rerender(<Input type="search" data-testid="i" />)
    expect(screen.getByTestId("i")).toHaveAttribute("type", "search")
    rerender(<Input type="number" data-testid="i" />)
    expect(screen.getByTestId("i")).toHaveAttribute("type", "number")
    rerender(<Input type="url" data-testid="i" />)
    expect(screen.getByTestId("i")).toHaveAttribute("type", "url")
  })

  it("is disabled when `disabled` is set", () => {
    render(<Input disabled placeholder="Email" />)
    expect(screen.getByPlaceholderText("Email")).toBeDisabled()
  })

  it("is read-only when `readOnly` is set", () => {
    render(<Input readOnly defaultValue="locked" />)
    const input = screen.getByDisplayValue("locked")
    expect(input).toHaveAttribute("readonly")
  })

  it("sets `aria-invalid` when `state` is `error`", () => {
    render(<Input state="error" placeholder="Email" />)
    const input = screen.getByPlaceholderText("Email")
    expect(input).toHaveAttribute("aria-invalid", "true")
  })

  it("renders the prefix + suffix slots", () => {
    render(
      <Input
        placeholder="Email"
        prefix={<span data-testid="prefix">P</span>}
        suffix={<span data-testid="suffix">S</span>}
      />,
    )
    expect(screen.getByTestId("prefix")).toBeInTheDocument()
    expect(screen.getByTestId("suffix")).toBeInTheDocument()
  })

  it("shows a clear button when `clearable` and the value is non-empty", async () => {
    render(<Input clearable aria-label="Email" defaultValue="hello" />)
    const clearBtn = screen.getByRole("button", { name: "Clear" })
    expect(clearBtn).toBeInTheDocument()
    await userEvent.click(clearBtn)
    expect(screen.getByLabelText("Email")).toHaveValue("")
  })

  it("forwards ref to the underlying input", () => {
    const ref = createRef<HTMLInputElement>()
    render(<Input ref={ref} placeholder="Email" />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it("renders a different `size`", () => {
    render(<Input size="lg" placeholder="Email" />)
    const wrapper = screen.getByPlaceholderText("Email").parentElement
    expect(wrapper?.className).toMatch(/h-11/)
  })
})
