/**
 * GraphSearch — F6 Part 1.
 *
 * Pure presentational shell (no 3D, no R3F).
 * Pins the user-facing contract:
 *   - renders the input
 *   - submit / Enter fires the onQuery callback
 *     with the current value
 *   - the clear button clears the field AND
 *     fires onQuery with an empty string
 *   - Escape clears + fires onQuery("")
 *   - the input has the right accessible label
 *     + role
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { GraphSearch } from "@/components/graph"

describe("GraphSearch", () => {
  it("renders the search input with the right accessible label", () => {
    render(<GraphSearch onQuery={() => {}} />)
    const input = screen.getByRole("searchbox", { name: /search knowledge graph/i })
    expect(input).toBeInTheDocument()
  })

  it("fires onQuery with the current value when the form is submitted", async () => {
    const user = userEvent.setup()
    const onQuery = vi.fn()
    render(<GraphSearch onQuery={onQuery} />)
    const input = screen.getByRole("searchbox")
    await user.type(input, "cortex{Enter}")
    expect(onQuery).toHaveBeenCalledWith("cortex")
  })

  it("fires onQuery with an empty string when Escape is pressed with content", async () => {
    const user = userEvent.setup()
    const onQuery = vi.fn()
    render(<GraphSearch onQuery={onQuery} />)
    const input = screen.getByRole("searchbox")
    await user.type(input, "hello")
    // Press Escape
    await user.keyboard("{Escape}")
    expect(onQuery).toHaveBeenCalledWith("")
  })

  it("does not fire onQuery with empty when the input was already empty and Escape is pressed", async () => {
    const user = userEvent.setup()
    const onQuery = vi.fn()
    render(<GraphSearch onQuery={onQuery} />)
    const input = screen.getByRole("searchbox")
    input.focus()
    await user.keyboard("{Escape}")
    // No prior type → no callback (the guard
    // skips when current === "")
    expect(onQuery).not.toHaveBeenCalled()
  })

  it("clears via the clear button and fires onQuery('') ", async () => {
    const user = userEvent.setup()
    const onQuery = vi.fn()
    render(<GraphSearch onQuery={onQuery} />)
    const input = screen.getByRole("searchbox")
    await user.type(input, "abc")
    // The clear button is a real <button> with
    // the accessible name we set.
    const clearButton = screen.getByRole("button", { name: /clear search/i })
    await user.click(clearButton)
    expect(input).toHaveValue("")
    expect(onQuery).toHaveBeenCalledWith("")
  })

  it("accepts a controlled value prop", () => {
    render(<GraphSearch onQuery={() => {}} value="controlled" />)
    const input = screen.getByRole("searchbox")
    expect(input).toHaveValue("controlled")
  })
})
