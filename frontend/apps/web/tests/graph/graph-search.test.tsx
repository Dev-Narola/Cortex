/**
 * GraphSearch — F6 Part 2.
 *
 * The bar is now a controlled input (the
 * explorer owns the query string). Tests pin:
 *   - the input is controlled
 *   - typing fires onQuery on every change
 *   - Escape clears
 *   - the clear button clears + fires onQuery("")
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"

import { GraphSearch } from "@/components/graph"

describe("GraphSearch", () => {
  it("renders the search input with the right accessible label", () => {
    render(<GraphSearch value="" onQuery={() => {}} />)
    const input = screen.getByRole("searchbox", { name: /search knowledge graph/i })
    expect(input).toBeInTheDocument()
  })

  it("fires onQuery on every keystroke (no debounce — explorer debounces)", async () => {
    const user = userEvent.setup()
    const onQuery = vi.fn()
    // The test wrapper emulates the explorer's
    // controlled-input behaviour: typing
    // updates the parent's value, which the
    // wrapper re-passes back to the input.
    function ControlledHarness() {
      const [v, setV] = React.useState("")
      return (
        <GraphSearch
          value={v}
          onQuery={(next) => {
            onQuery(next)
            setV(next)
          }}
        />
      )
    }
    // Lazy import keeps the test file's top
    // imports tidy.
    const React = await import("react")
    render(<ControlledHarness />)
    const input = screen.getByRole("searchbox")
    await user.type(input, "cortex")
    // 6 letters → 6 calls. Each call's argument
    // is the cumulative value (c, co, cor, ...).
    expect(onQuery).toHaveBeenCalledTimes(6)
    expect(onQuery).toHaveBeenLastCalledWith("cortex")
  })

  it("fires onQuery('') when Escape is pressed with content", async () => {
    const user = userEvent.setup()
    const onQuery = vi.fn()
    render(<GraphSearch value="hello" onQuery={onQuery} />)
    const input = screen.getByRole("searchbox")
    input.focus()
    await user.keyboard("{Escape}")
    expect(onQuery).toHaveBeenCalledWith("")
  })

  it("does not fire onQuery when Escape is pressed with empty content", async () => {
    const user = userEvent.setup()
    const onQuery = vi.fn()
    render(<GraphSearch value="" onQuery={onQuery} />)
    const input = screen.getByRole("searchbox")
    input.focus()
    await user.keyboard("{Escape}")
    expect(onQuery).not.toHaveBeenCalled()
  })

  it("clears via the clear button and fires onQuery('') ", async () => {
    const user = userEvent.setup()
    const onQuery = vi.fn()
    render(<GraphSearch value="abc" onQuery={onQuery} />)
    const clearButton = screen.getByRole("button", { name: /clear search/i })
    await user.click(clearButton)
    expect(onQuery).toHaveBeenCalledWith("")
  })

  it("does not render the clear button when the value is empty", () => {
    render(<GraphSearch value="" onQuery={() => {}} />)
    expect(screen.queryByRole("button", { name: /clear search/i })).not.toBeInTheDocument()
  })

  it("reflects a controlled value", () => {
    render(<GraphSearch value="controlled" onQuery={() => {}} />)
    expect(screen.getByRole("searchbox")).toHaveValue("controlled")
  })
})
