/**
 * Unit tests for `AuthError` component.
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AuthError } from "@/components/auth/AuthError"

describe("AuthError", () => {
  it("renders null when error is null/undefined and no message is provided", () => {
    const { container } = render(<AuthError error={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders known error message for invalid_credentials", () => {
    render(<AuthError error="invalid_credentials" />)
    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByText("Invalid email, password, or workspace.")).toBeInTheDocument()
  })

  it("renders custom message string when provided", () => {
    render(<AuthError error="server_error" message="Custom server issue" />)
    expect(screen.getByText("Custom server issue")).toBeInTheDocument()
  })

  it("renders raw string error if not in predefined lookup", () => {
    render(<AuthError error="Something custom failed" />)
    expect(screen.getByText("Something custom failed")).toBeInTheDocument()
  })
})
