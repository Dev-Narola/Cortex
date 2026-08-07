/**
 * DocumentIngestionProgress — F3 Part 4 (Task 39).
 *
 * The progress bar is a pure visual surface
 * derived from the document's status. No
 * interpolation, no setTimeout — the backend
 * is the source of truth.
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { DocumentIngestionProgress } from "@/components/documents/DocumentIngestionProgress"

describe("DocumentIngestionProgress", () => {
  it("renders 0% for pending", () => {
    render(<DocumentIngestionProgress status="pending" />)
    const bar = screen.getByRole("progressbar", { name: /pending/i })
    expect(bar).toHaveAttribute("aria-valuenow", "0")
  })

  it("renders 25% for parsing", () => {
    render(<DocumentIngestionProgress status="parsing" />)
    const bar = screen.getByRole("progressbar", { name: /parsing/i })
    expect(bar).toHaveAttribute("aria-valuenow", "25")
  })

  it("renders 50% for chunking", () => {
    render(<DocumentIngestionProgress status="chunking" />)
    const bar = screen.getByRole("progressbar", { name: /chunking/i })
    expect(bar).toHaveAttribute("aria-valuenow", "50")
  })

  it("renders 75% for embedding", () => {
    render(<DocumentIngestionProgress status="embedding" />)
    const bar = screen.getByRole("progressbar", { name: /embedding/i })
    expect(bar).toHaveAttribute("aria-valuenow", "75")
  })

  it("renders 100% for indexed", () => {
    render(<DocumentIngestionProgress status="indexed" />)
    const bar = screen.getByRole("progressbar", { name: /indexed/i })
    expect(bar).toHaveAttribute("aria-valuenow", "100")
  })

  it("renders the error pill for failed", () => {
    render(<DocumentIngestionProgress status="failed" />)
    // No progressbar in the failed state —
    // it's an error pill instead.
    expect(screen.queryByRole("progressbar")).toBeNull()
    expect(screen.getByText(/failed/i)).toBeInTheDocument()
  })
})
