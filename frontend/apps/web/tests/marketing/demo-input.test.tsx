/**
 * DemoInput — F8 Part 4.
 *
 * Tests the chat composer:
 *   - Typing updates the value.
 *   - Enter submits the question.
 *   - The submit button is disabled when
 *     the input is empty.
 *   - The submit button is disabled when
 *     `disabled` is set (streaming).
 *   - The submit button is a real button
 *     with a label.
 *   - A11y: the form has a label, the
 *     input has an `aria-label`.
 */

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DemoInput } from "@/components/marketing/demo/demo-input"

describe("DemoInput", () => {
  it("renders an input + submit button with accessible labels", () => {
    render(
      <DemoInput
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    const input = screen.getByTestId("demo-input")
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute("aria-label", "Ask Cortex a question")
    const submit = screen.getByTestId("demo-submit")
    expect(submit).toBeInTheDocument()
    expect(submit).toHaveAttribute("aria-label", "Ask Cortex")
  })

  it("calls onChange when the user types", () => {
    const onChange = vi.fn()
    render(
      <DemoInput
        value=""
        onChange={onChange}
        onSubmit={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByTestId("demo-input"), {
      target: { value: "How does hybrid search work?" },
    })
    expect(onChange).toHaveBeenCalledWith("How does hybrid search work?")
  })

  it("Enter submits when there is content", () => {
    const onSubmit = vi.fn()
    render(
      <DemoInput
        value="hello"
        onChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.keyDown(screen.getByTestId("demo-input"), { key: "Enter" })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("Enter does NOT submit when the input is empty", () => {
    const onSubmit = vi.fn()
    render(
      <DemoInput
        value=""
        onChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.keyDown(screen.getByTestId("demo-input"), { key: "Enter" })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("the submit button is disabled when the input is empty", () => {
    render(
      <DemoInput
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByTestId("demo-submit")).toBeDisabled()
  })

  it("the submit button is disabled when `disabled` is set (streaming)", () => {
    render(
      <DemoInput
        value="hello"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        disabled
      />,
    )
    expect(screen.getByTestId("demo-submit")).toBeDisabled()
    expect(screen.getByTestId("demo-input")).toBeDisabled()
  })

  it("the submit button submits when clicked", () => {
    const onSubmit = vi.fn()
    render(
      <DemoInput
        value="hello"
        onChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.click(screen.getByTestId("demo-submit"))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
