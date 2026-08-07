/**
 * Document components — F3 Part 2 (Tasks 14–20).
 *
 * Covers:
 *   - DocumentStatusBadge maps every status to the
 *     expected Badge variant + label.
 *   - DocumentRow renders all 5 columns + the
 *     action button, and triggers selection.
 *   - DocumentsTable renders the F1 column headers.
 *   - DocumentSelectionProvider exposes the
 *     `useDocumentSelection` contract.
 *   - DocumentErrorState categorises 4 error kinds.
 *   - DocumentsEmptyState renders the "No documents
 *     yet" copy + the Upload CTA.
 *   - DocumentToolbar renders the search + filter +
 *     sort + Upload row.
 */

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DocumentErrorState } from "@/components/documents/DocumentErrorState"
import { DocumentRow } from "@/components/documents/DocumentRow"
import {
  DocumentSelectionProvider,
  useDocumentSelection,
} from "@/components/documents/DocumentSelectionProvider"
import { DocumentStatusBadge } from "@/components/documents/DocumentStatusBadge"
import { DocumentToolbar } from "@/components/documents/DocumentToolbar"
import { DocumentsEmptyState } from "@/components/documents/DocumentsEmptyState"
import { DocumentsTable } from "@/components/documents/DocumentsTable"
import { FrontendError } from "@/lib/http/errors"
import { DOCUMENT_STATUSES, type Document } from "@/services/documents"

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: "d-1",
    title: "Quarterly Plan.pdf",
    mime_type: "application/pdf",
    status: "indexed",
    created_at: "2025-03-01T12:30:00.000Z",
    ...overrides,
  }
}

function withSelection(ui: React.ReactNode) {
  return <DocumentSelectionProvider>{ui}</DocumentSelectionProvider>
}

beforeEach(() => {
  // TooltipRoot uses Radix which mounts a portal — silence
  // any console.error noise from happy-dom's missing
  // getBoundingClientRect on the portal host.
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("DocumentStatusBadge", () => {
  it("renders the human label for every status", () => {
    for (const status of DOCUMENT_STATUSES) {
      const { container } = render(<DocumentStatusBadge status={status} />)
      const labelMap: Record<string, string> = {
        pending: "Pending",
        parsing: "Parsing",
        chunking: "Chunking",
        embedding: "Embedding",
        indexed: "Indexed",
        failed: "Failed",
      }
      expect(container).toHaveTextContent(labelMap[status]!)
    }
  })

  it("renders with the expected variant per status", () => {
    const cases: Array<[Document["status"], string]> = [
      ["pending", "cloud-200"],
      ["parsing", "volt-200"],
      ["chunking", "volt-200"],
      ["embedding", "volt-200"],
      ["indexed", "success"],
      ["failed", "destructive"],
    ]
    for (const [status, expectedClass] of cases) {
      const { container } = render(<DocumentStatusBadge status={status} />)
      const badge = container.querySelector("[class*='rounded-full']")
      expect(badge?.className).toContain(expectedClass)
    }
  })
})

describe("DocumentRow", () => {
  it("renders the title, status badge, mime type, and a date", () => {
    render(
      withSelection(
        <table>
          <tbody>
            <DocumentRow
              document={makeDoc()}
              isSelected={false}
              onSelect={() => {}}
              onOpenDetail={() => {}}
            />
          </tbody>
        </table>,
      ),
    )
    expect(screen.getByText("Quarterly Plan.pdf")).toBeInTheDocument()
    expect(screen.getByText("application/pdf")).toBeInTheDocument()
    expect(screen.getByText("Indexed")).toBeInTheDocument()
    // Chunks placeholder
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("calls onSelect + onOpenDetail when the row is clicked", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onOpenDetail = vi.fn()
    render(
      withSelection(
        <table>
          <tbody>
            <DocumentRow
              document={makeDoc({ id: "row-1" })}
              isSelected={false}
              onSelect={onSelect}
              onOpenDetail={onOpenDetail}
            />
          </tbody>
        </table>,
      ),
    )
    await user.click(screen.getByText("Quarterly Plan.pdf"))
    expect(onSelect).toHaveBeenCalledWith("row-1")
    expect(onOpenDetail).toHaveBeenCalledWith("row-1")
  })

  it("calls onOpenDetail when the actions button is clicked (without triggering row click)", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onOpenDetail = vi.fn()
    render(
      withSelection(
        <table>
          <tbody>
            <DocumentRow
              document={makeDoc({ id: "row-2" })}
              isSelected={false}
              onSelect={onSelect}
              onOpenDetail={onOpenDetail}
            />
          </tbody>
        </table>,
      ),
    )
    const actionsBtn = screen.getByRole("button", {
      name: /open quarterly plan\.pdf details/i,
    })
    await user.click(actionsBtn)
    expect(onOpenDetail).toHaveBeenCalledWith("row-2")
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe("DocumentsTable", () => {
  it("renders the F1 column headers", () => {
    render(
      withSelection(
        <DocumentsTable documents={[makeDoc({ id: "a" }), makeDoc({ id: "b" })]} />,
      ),
    )
    const table = screen.getByRole("table")
    const headerRow = within(table).getAllByRole("row")[0]!
    expect(within(headerRow).getByText("Name")).toBeInTheDocument()
    expect(within(headerRow).getByText("Status")).toBeInTheDocument()
    expect(within(headerRow).getByText("Source")).toBeInTheDocument()
    expect(within(headerRow).getByText("Chunks")).toBeInTheDocument()
    expect(within(headerRow).getByText("Updated")).toBeInTheDocument()
  })

  it("renders one row per document", () => {
    render(
      withSelection(
        <DocumentsTable
          documents={[
            makeDoc({ id: "a", title: "Alpha" }),
            makeDoc({ id: "b", title: "Bravo" }),
            makeDoc({ id: "c", title: "Charlie" }),
          ]}
        />,
      ),
    )
    expect(screen.getByText("Alpha")).toBeInTheDocument()
    expect(screen.getByText("Bravo")).toBeInTheDocument()
    expect(screen.getByText("Charlie")).toBeInTheDocument()
  })
})

describe("DocumentSelectionProvider", () => {
  it("throws when useDocumentSelection is used outside the provider", () => {
    // The Provider exposes the hook to test
    // the error path explicitly.
    function Probe() {
      useDocumentSelection()
      return null
    }
    // Render outside the provider — expect throw.
    expect(() => render(<Probe />)).toThrow(/must be used inside/i)
  })

  it("returns the initial null state", () => {
    function Probe() {
      const sel = useDocumentSelection()
      return (
        <span data-testid="state">
          {`${sel.selectedId ?? "null"}|${sel.isOpen ? "open" : "closed"}`}
        </span>
      )
    }
    render(
      <DocumentSelectionProvider>
        <Probe />
      </DocumentSelectionProvider>,
    )
    expect(screen.getByTestId("state")).toHaveTextContent("null|closed")
  })

  it("select() updates selectedId", async () => {
    const user = userEvent.setup()
    function Probe() {
      const sel = useDocumentSelection()
      return (
        <button type="button" onClick={() => sel.select("d-1")}>
          pick
        </button>
      )
    }
    function Show() {
      const sel = useDocumentSelection()
      return <span data-testid="v">{sel.selectedId ?? "null"}</span>
    }
    render(
      <DocumentSelectionProvider>
        <Probe />
        <Show />
      </DocumentSelectionProvider>,
    )
    expect(screen.getByTestId("v")).toHaveTextContent("null")
    await user.click(screen.getByRole("button", { name: /pick/i }))
    expect(await screen.findByTestId("v")).toHaveTextContent("d-1")
  })
})

describe("DocumentErrorState", () => {
  it("renders the network copy for a network error", () => {
    render(
      <DocumentErrorState
        error={new FrontendError({ kind: "network", message: "offline" })}
        onRetry={() => {}}
      />,
    )
    expect(screen.getByText(/can't reach cortex/i)).toBeInTheDocument()
  })

  it("renders the server copy for a 5xx", () => {
    render(
      <DocumentErrorState
        error={
          new FrontendError({
            kind: "server",
            status: 500,
            message: "boom",
          })
        }
        onRetry={() => {}}
      />,
    )
    expect(screen.getByText(/the server hit an error/i)).toBeInTheDocument()
  })

  it("renders the permission copy for a 401/403", () => {
    render(
      <DocumentErrorState
        error={
          new FrontendError({
            kind: "unauthorized",
            status: 401,
            message: "nope",
          })
        }
        onRetry={() => {}}
      />,
    )
    expect(screen.getByText(/you don't have access/i)).toBeInTheDocument()
  })

  it("renders the generic copy for an unknown error", () => {
    render(
      <DocumentErrorState
        error={
          new FrontendError({
            kind: "unknown",
            status: 418,
            message: "teapot",
          })
        }
        onRetry={() => {}}
      />,
    )
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
  })

  it("calls onRetry when the retry button is clicked", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <DocumentErrorState
        error={new FrontendError({ kind: "network", message: "x" })}
        onRetry={onRetry}
      />,
    )
    await user.click(screen.getByRole("button", { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

describe("DocumentsEmptyState", () => {
  it("renders the title + description", () => {
    render(<DocumentsEmptyState onUpload={() => {}} />)
    expect(screen.getByText(/no documents yet/i)).toBeInTheDocument()
    expect(
      screen.getByText(/upload your first document to begin building your knowledge base/i),
    ).toBeInTheDocument()
  })

  it("renders the Upload CTA and calls onUpload on click", async () => {
    const user = userEvent.setup()
    const onUpload = vi.fn()
    render(<DocumentsEmptyState onUpload={onUpload} />)
    await user.click(screen.getByRole("button", { name: /upload document/i }))
    expect(onUpload).toHaveBeenCalledOnce()
  })
})

describe("DocumentToolbar", () => {
  it("renders the title + count", () => {
    render(
      <DocumentToolbar total={3} loading={false} onUpload={() => {}} />,
    )
    expect(screen.getByText(/all documents/i)).toBeInTheDocument()
    expect(screen.getByText(/3 documents/i)).toBeInTheDocument()
  })

  it("shows Loading… while the initial fetch is in flight", () => {
    render(<DocumentToolbar total={0} loading onUpload={() => {}} />)
    expect(screen.getByText(/loading…/i)).toBeInTheDocument()
  })

  it("renders the search input", () => {
    render(<DocumentToolbar total={0} loading={false} onUpload={() => {}} />)
    expect(screen.getByLabelText(/search documents/i)).toBeInTheDocument()
  })

  it("calls onUpload when the Upload button is clicked", async () => {
    const user = userEvent.setup()
    const onUpload = vi.fn()
    render(<DocumentToolbar total={0} loading={false} onUpload={onUpload} />)
    await user.click(screen.getByRole("button", { name: /^upload documents$/i }))
    expect(onUpload).toHaveBeenCalledOnce()
  })
})
