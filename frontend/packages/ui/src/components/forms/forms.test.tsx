/**
 * Form composition — unit tests.
 *
 * F1 Part 4 (Task 35).
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "./index"
import { Input } from "./input/Input"

function FullField({
  error,
  description,
  required,
}: {
  error?: string
  description?: string
  required?: boolean
}) {
  return (
    <FormField name="email" error={error} description={description} required={required}>
      <FormItem>
        <FormLabel>Email</FormLabel>
        <FormControl>
          <Input type="email" />
        </FormControl>
        {description ? <FormDescription>{description}</FormDescription> : null}
        <FormMessage />
      </FormItem>
    </FormField>
  )
}

describe("Form composition", () => {
  it("renders a label whose htmlFor points at the input id", () => {
    render(<FullField />)
    const input = screen.getByLabelText(/email/i)
    expect(input.tagName).toBe("INPUT")
    expect(input).toHaveAttribute("type", "email")
  })

  it("shows the * indicator when required", () => {
    render(<FullField required />)
    expect(screen.getByText("*")).toBeInTheDocument()
  })

  it("does not show * when not required", () => {
    render(<FullField />)
    expect(screen.queryByText("*")).not.toBeInTheDocument()
  })

  it("renders the description with the right id for aria-describedby", () => {
    render(<FullField description="We'll never share this." />)
    const description = screen.getByText("We'll never share this.")
    expect(description.id).toMatch(/-description$/)
    const input = screen.getByLabelText(/email/i)
    expect(input.getAttribute("aria-describedby")).toContain(description.id)
  })

  it("renders the error message in the alert role when invalid", () => {
    render(<FullField error="Email is required" />)
    // The `role="alert"` lives on the wrapping <p>, not the inner
    // <span> containing the message text. Query by role to assert
    // the alert is wired up.
    const message = screen.getByRole("alert")
    expect(message).toHaveTextContent("Email is required")
    const input = screen.getByLabelText(/email/i)
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input.getAttribute("aria-describedby")).toContain(message.id)
  })

  it("does not render the FormMessage when there is no error and no children", () => {
    render(<FullField />)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("uses an explicit id when provided", () => {
    render(
      <FormField name="email" id="custom-email-id">
        <FormItem>
          <FormLabel>Email</FormLabel>
          <FormControl>
            <Input type="email" />
          </FormControl>
        </FormItem>
      </FormField>,
    )
    const input = screen.getByLabelText(/email/i)
    expect(input.id).toBe("custom-email-id")
  })

  it("throws when FormLabel is used outside a FormField", () => {
    expect(() => render(<FormLabel>Label</FormLabel>)).toThrow(/FormField/)
  })
})
