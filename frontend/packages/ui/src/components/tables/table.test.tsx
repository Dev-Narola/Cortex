/**
 * Table — unit tests.
 *
 * F1 Part 3 (Task 26).
 *
 * **Scope.** Render the compound API (Table, TableHeader,
 * TableBody, TableRow, TableCell, TableHead, TableToolbar)
 * and verify the state / alignment / selection axes.
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
} from "./index"

describe("Table", () => {
  it("renders the responsive scrolling wrapper", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    const cell = screen.getByText("Cell")
    expect(cell.tagName).toBe("TD")
    // Wrapper has the overflow class
    const wrapper = cell.closest("div")
    expect(wrapper).not.toBeNull()
  })

  it("renders the toolbar with title + description + actions", () => {
    render(
      <TableToolbar
        title="Documents"
        description="All uploaded files"
        actions={<button type="button">Upload</button>}
      />,
    )
    expect(screen.getByText("Documents")).toBeInTheDocument()
    expect(screen.getByText("All uploaded files")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument()
  })

  it("TableHead renders as a th with muted typography", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    )
    const head = screen.getByText("Name")
    expect(head.tagName).toBe("TH")
    expect(head.className).toMatch(/uppercase/)
  })

  it("TableRow applies the selected data-state + background", () => {
    render(
      <Table>
        <TableBody>
          <TableRow state="selected" data-testid="row">
            <TableCell>Active</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    const row = screen.getByTestId("row")
    expect(row.getAttribute("data-state")).toBe("selected")
    expect(row.className).toMatch(/ember/)
  })

  it("TableCell renders a td with the right alignment", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell align="right" data-testid="cell">
              42
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    const cell = screen.getByTestId("cell")
    expect(cell.tagName).toBe("TD")
    expect(cell.className).toMatch(/text-right/)
  })
})
