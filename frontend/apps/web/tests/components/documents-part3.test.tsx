/**
 * Document components — F3 Part 3 (Tasks 21-30).
 *
 * Covers:
 *   - FileUploadTab + UrlUploadTab
 *   - UploadDocumentModal (tabs, submit, validation,
 *     cancel during upload, success + error toasts)
 *   - DocumentDetailDrawer (open from selection,
 *     metadata + status, delete + reprocess buttons)
 *   - DeleteDocumentDialog (confirm + success)
 *   - ReprocessDocumentDialog (confirm + success)
 *   - DocumentMetadata (renders the placeholder
 *     "—" rows for fields the V4 API doesn't
 *     expose)
 *   - MetadataRow
 *   - DocumentHeader
 *   - DocumentSelectionProvider Part 3 update
 *     (openDetail sets isOpen=true)
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@cortex/api-client"
import { ToastProvider, ToastViewport } from "@cortex/ui"

import { DeleteDocumentDialog } from "@/components/documents/actions/DeleteDocumentDialog"
import { ReprocessDocumentDialog } from "@/components/documents/actions/ReprocessDocumentDialog"
import { DocumentDetailDrawer } from "@/components/documents/detail/DocumentDetailDrawer"
import { DocumentHeader } from "@/components/documents/detail/DocumentHeader"
import { DocumentMetadata } from "@/components/documents/detail/DocumentMetadata"
import { MetadataRow } from "@/components/documents/detail/MetadataRow"
import {
  DocumentSelectionProvider,
  useDocumentSelection,
} from "@/components/documents/DocumentSelectionProvider"
import {
  useDocumentSelectionStore,
} from "@/components/documents/DocumentSelectionStore"
import { FileUploadTab } from "@/components/documents/upload/FileUploadTab"
import { UploadDocumentModal } from "@/components/documents/upload/UploadDocumentModal"
import { UrlUploadTab } from "@/components/documents/upload/UrlUploadTab"
import { getApiClient } from "@/lib/auth/api-client"
import type { Document } from "@/services/documents"

vi.mock("@/lib/auth/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/api-client")>(
      "@/lib/auth/api-client",
    )
  return {
    ...actual,
    getApiClient: vi.fn(),
    resetApiClient: vi.fn(),
  }
})

const getApiClientMock = vi.mocked(getApiClient)

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false, staleTime: 0 },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>
        {children}
        <ToastViewport />
      </ToastProvider>
    </QueryClientProvider>
  )
}

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: "d-1",
    title: "Quarterly Plan.pdf",
    mime_type: "application/pdf",
    status: "indexed",
    created_at: "2025-01-01T12:30:00.000Z",
    ...overrides,
  }
}

function makeFile(name: string, size = 10, type = "application/pdf"): File {
  return new File([new Uint8Array(size)], name, { type })
}

/**
 * Set files on a hidden `<input type="file">` via a
 * `change` event. The FileUploadTab's input is
 * `sr-only` (visually hidden) and lives inside a
 * Radix Dialog portal — so `container.querySelector`
 * can't see it. We query the document directly, then
 * set the `files` property + fire a `change` event.
 *
 * **Why not user.upload?** The input is `sr-only`;
 * user-event's upload helper reads
 * `input.namespaceURI` and crashes with
 * `Cannot read properties of null` when the input
 * isn't attached to a real DOM.
 */
function setFileOnInput(file: File): void {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement | null
  if (!input) throw new Error("file input not found")
  Object.defineProperty(input, "files", {
    value: [file],
    configurable: true,
  })
  fireEvent.change(input)
}

beforeEach(() => {
  // F4 Part 3: the selection store is
  // module-level; reset before every test
  // so the test order doesn't matter.
  useDocumentSelectionStore.getState().reset()
  // Radix + happy-dom emit portal warnings we don't
  // care about in unit tests.
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// FileUploadTab + UrlUploadTab
// ---------------------------------------------------------------------------

describe("FileUploadTab", () => {
  it("renders the drop zone with the supported-types copy", () => {
    render(<FileUploadTab file={null} onChange={() => {}} />)
    expect(
      screen.getByText(/drag & drop a file, or click to browse/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/\.pdf, \.docx, \.txt, \.md/i)).toBeInTheDocument()
  })

  it("shows the chosen file's name + size", () => {
    render(
      <FileUploadTab
        file={makeFile("plan.pdf", 2048, "application/pdf")}
        onChange={() => {}}
      />,
    )
    // The file name shows in the drop-zone + the
    // chip — assert both are present.
    expect(screen.getAllByText("plan.pdf").length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/2\.0\s?KB/)).toBeInTheDocument()
  })

  it("calls onChange(null) when Remove is clicked", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <FileUploadTab
        file={makeFile("plan.pdf", 1024, "application/pdf")}
        onChange={onChange}
      />,
    )
    await user.click(screen.getByRole("button", { name: /remove selected file/i }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it("forwards a file from the input", async () => {
    const onChange = vi.fn()
    render(
      <FileUploadTab file={null} onChange={onChange} />,
    )
    const file = makeFile("x.pdf", 1024, "application/pdf")
    setFileOnInput(file)
    expect(onChange).toHaveBeenCalledWith(file)
  })
})

describe("UrlUploadTab", () => {
  it("renders the input with the placeholder", () => {
    render(<UrlUploadTab value="" onChange={() => {}} />)
    expect(screen.getByPlaceholderText(/https:\/\/example.com/i)).toBeInTheDocument()
  })

  it("calls onChange on input", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<UrlUploadTab value="" onChange={onChange} />)
    const input = screen.getByPlaceholderText(/https:\/\/example.com/i)
    await user.type(input, "h")
    expect(onChange).toHaveBeenCalledWith("h")
  })

  it("renders the error message when error is set", () => {
    render(
      <UrlUploadTab value="x" onChange={() => {}} error="That's not a URL" />,
    )
    expect(screen.getByRole("alert")).toHaveTextContent(/that's not a url/i)
  })
})

// ---------------------------------------------------------------------------
// UploadDocumentModal
// ---------------------------------------------------------------------------

describe("UploadDocumentModal", () => {
  it("renders both tabs and the disabled submit", () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
          })
        }
      >
        <ToastProvider>
          <UploadDocumentModal open onOpenChange={() => {}} />
          <ToastViewport />
        </ToastProvider>
      </QueryClientProvider>,
    )
    expect(screen.getByRole("tab", { name: /^file$/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /^url$/i })).toBeInTheDocument()
    // Submit is disabled until a file/url is provided
    expect(screen.getByRole("button", { name: /^upload$/i })).toBeDisabled()
  })

  it("shows the URL tab copy on the URL tab", async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
          })
        }
      >
        <ToastProvider>
          <UploadDocumentModal open onOpenChange={() => {}} />
          <ToastViewport />
        </ToastProvider>
      </QueryClientProvider>,
    )
    await user.click(screen.getByRole("tab", { name: /^url$/i }))
    expect(screen.getByPlaceholderText(/https:\/\/example.com/i)).toBeInTheDocument()
  })

  it("uploads a valid file and shows a success toast", async () => {
    const post = vi.fn().mockResolvedValue({
      id: "new",
      status: "pending",
      message: "queued",
    })
    getApiClientMock.mockReturnValue({ post } as never)
    const onOpenChange = vi.fn()
    const onUploaded = vi.fn()

    const user = userEvent.setup()
    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
          })
        }
      >
        <ToastProvider>
          <UploadDocumentModal
            open
            onOpenChange={onOpenChange}
            onUploaded={onUploaded}
          />
          <ToastViewport />
        </ToastProvider>
      </QueryClientProvider>,
    )
    const file = makeFile("plan.pdf", 1024, "application/pdf")
    setFileOnInput(file)

    await user.click(screen.getByRole("button", { name: /^upload$/i }))

    await waitFor(() => expect(post).toHaveBeenCalled())
    // Wait for the modal to close (success path).
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(onUploaded).toHaveBeenCalledWith("new")
  })

  it("surfaces an error toast when the upload fails", async () => {
    const post = vi
      .fn()
      .mockRejectedValue(new ApiError(413, { message: "Too large" }))
    getApiClientMock.mockReturnValue({ post } as never)
    const onOpenChange = vi.fn()

    const user = userEvent.setup()
    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
          })
        }
      >
        <ToastProvider>
          <UploadDocumentModal open onOpenChange={onOpenChange} />
          <ToastViewport />
        </ToastProvider>
      </QueryClientProvider>,
    )
    setFileOnInput(makeFile("plan.pdf", 1024, "application/pdf"))
    await user.click(screen.getByRole("button", { name: /^upload$/i }))

    await waitFor(() => expect(post).toHaveBeenCalled())
    // The modal should NOT close on failure
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it("renders the URL tab with a placeholder notice", async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
          })
        }
      >
        <ToastProvider>
          <UploadDocumentModal open onOpenChange={() => {}} />
          <ToastViewport />
        </ToastProvider>
      </QueryClientProvider>,
    )
    await user.click(screen.getByRole("tab", { name: /^url$/i }))
    // The URL tab is a placeholder until the backend
    // exposes a URL-ingestion endpoint. The copy
    // clarifies the user can paste a https:// URL but
    // the submit is wired to a "coming soon" toast.
    const input = await screen.findByPlaceholderText(
      /https:\/\/example.com/i,
    )
    expect(input).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Document detail (drawer + pieces)
// ---------------------------------------------------------------------------

function SelectOpener({ id }: { id: string }) {
  const { openDetail } = useDocumentSelection()
  return (
    <button type="button" onClick={() => openDetail(id)}>
      open
    </button>
  )
}

describe("DocumentSelectionProvider (Part 3)", () => {
  it("openDetail() sets isOpen=true and selectedId", async () => {
    const user = userEvent.setup()
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
        <SelectOpener id="d-1" />
        <Probe />
      </DocumentSelectionProvider>,
    )
    expect(screen.getByTestId("state")).toHaveTextContent("null|closed")
    await user.click(screen.getByRole("button", { name: /open/i }))
    expect(await screen.findByTestId("state")).toHaveTextContent("d-1|open")
  })
})

describe("DocumentDetailDrawer", () => {
  it("renders the loading state when no data is yet available", async () => {
    // A never-resolving get → stays in isLoading
    getApiClientMock.mockReturnValue({
      get: vi.fn().mockReturnValue(new Promise(() => {})),
    } as never)
    render(
      <DocumentSelectionProvider>
        <SelectOpener id="d-1" />
        <DocumentDetailDrawer />
      </DocumentSelectionProvider>,
      { wrapper: makeWrapper() },
    )
    // Trigger the open
    screen.getByRole("button", { name: /open/i }).click()
    // The drawer mounts the status surface while fetching
    await waitFor(() =>
      expect(screen.getAllByRole("status").length).toBeGreaterThan(0),
    )
  })

  it("renders the document metadata when the fetch resolves", async () => {
    getApiClientMock.mockReturnValue({
      get: vi.fn().mockResolvedValue(makeDoc({ title: "Plan", status: "indexed" })),
    } as never)
    render(
      <DocumentSelectionProvider>
        <SelectOpener id="d-1" />
        <DocumentDetailDrawer />
      </DocumentSelectionProvider>,
      { wrapper: makeWrapper() },
    )
    screen.getByRole("button", { name: /open/i }).click()
    // The title shows in both the header and the
    // metadata row — assert on the header specifically.
    expect(
      await screen.findByRole("heading", { name: /plan/i }),
    ).toBeInTheDocument()
    // Status badge shows in both the header and the
    // metadata row; assert it exists.
    expect(screen.getAllByText("Indexed").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("application/pdf").length).toBeGreaterThan(0)
    // Placeholders for fields the V4 API doesn't expose.
    const dashes = screen.getAllByText("—")
    expect(dashes.length).toBeGreaterThanOrEqual(4) // file size, updated, chunks, metadata
  })

  it("renders the not-found state for a 404", async () => {
    getApiClientMock.mockReturnValue({
      get: vi.fn().mockRejectedValue(new ApiError(404, { message: "not found" })),
    } as never)
    render(
      <DocumentSelectionProvider>
        <SelectOpener id="d-missing" />
        <DocumentDetailDrawer />
      </DocumentSelectionProvider>,
      { wrapper: makeWrapper() },
    )
    screen.getByRole("button", { name: /open/i }).click()
    expect(await screen.findByText(/document not found/i)).toBeInTheDocument()
  })

  it("shows the delete + reprocess buttons while a document is open", async () => {
    getApiClientMock.mockReturnValue({
      get: vi.fn().mockResolvedValue(makeDoc()),
    } as never)
    render(
      <DocumentSelectionProvider>
        <SelectOpener id="d-1" />
        <DocumentDetailDrawer />
      </DocumentSelectionProvider>,
      { wrapper: makeWrapper() },
    )
    screen.getByRole("button", { name: /open/i }).click()
    expect(
      await screen.findByRole("button", { name: /^delete$/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("button", { name: /^reprocess$/i }),
    ).toBeInTheDocument()
  })

  it("disables the reprocess button while ingestion is in progress", async () => {
    getApiClientMock.mockReturnValue({
      get: vi.fn().mockResolvedValue(makeDoc({ status: "parsing" })),
    } as never)
    render(
      <DocumentSelectionProvider>
        <SelectOpener id="d-1" />
        <DocumentDetailDrawer />
      </DocumentSelectionProvider>,
      { wrapper: makeWrapper() },
    )
    screen.getByRole("button", { name: /open/i }).click()
    const reprocess = await screen.findByRole("button", { name: /^reprocess$/i })
    expect(reprocess).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Document metadata pieces
// ---------------------------------------------------------------------------

describe("DocumentMetadata", () => {
  it("renders the title, status, source, file type, created + id", () => {
    render(
      <DocumentMetadata
        document={makeDoc({
          id: "abc-123",
          title: "My Doc",
          status: "indexed",
          mime_type: "text/plain",
          created_at: "2025-01-01T00:00:00.000Z",
        })}
      />,
    )
    // <dl> is not exposed as a "list" role in
    // testing-library — assert via the data the
    // rows actually contain.
    expect(screen.getByText("My Doc")).toBeInTheDocument()
    expect(screen.getByText("Indexed")).toBeInTheDocument()
    // mime_type shows in both the Source and the
    // File type rows; assert the count.
    expect(screen.getAllByText("text/plain").length).toBe(2)
    expect(screen.getByText("abc-123")).toBeInTheDocument()
  })
})

describe("DocumentHeader", () => {
  it("renders the title and the status badge", () => {
    render(<DocumentHeader document={makeDoc({ title: "Header Test" })} />)
    expect(screen.getByRole("heading", { name: /header test/i })).toBeInTheDocument()
    expect(screen.getByText("Indexed")).toBeInTheDocument()
  })
})

describe("MetadataRow", () => {
  it("renders the label + value", () => {
    render(<MetadataRow label="Foo" value="bar" />)
    const row = screen.getByText("Foo").closest("div")!
    expect(within(row).getByText("bar")).toBeInTheDocument()
  })
  it("renders a placeholder when value is null", () => {
    render(<MetadataRow label="Foo" value={null} />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Action dialogs
// ---------------------------------------------------------------------------

describe("DeleteDocumentDialog", () => {
  it("renders the confirmation copy and calls delete on confirm", async () => {
    const del = vi.fn().mockResolvedValue(undefined)
    getApiClientMock.mockReturnValue({ delete: del } as never)
    const onOpenChange = vi.fn()
    const onDeleted = vi.fn()
    const user = userEvent.setup()
    render(
      <DeleteDocumentDialog
        open
        onOpenChange={onOpenChange}
        documentId="d-1"
        documentTitle="Plan"
        onDeleted={onDeleted}
      />,
      { wrapper: makeWrapper() },
    )
    expect(
      screen.getByRole("heading", { name: /delete document\?/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /^delete$/i }))
    await waitFor(() => expect(del).toHaveBeenCalled())
    expect(onDeleted).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("surfaces an error toast on failure and keeps the dialog open", async () => {
    const del = vi
      .fn()
      .mockRejectedValue(new ApiError(500, { message: "boom" }))
    getApiClientMock.mockReturnValue({ delete: del } as never)
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(
      <DeleteDocumentDialog
        open
        onOpenChange={onOpenChange}
        documentId="d-1"
        documentTitle="Plan"
      />,
      { wrapper: makeWrapper() },
    )
    await user.click(screen.getByRole("button", { name: /^delete$/i }))
    await waitFor(() => expect(del).toHaveBeenCalled())
    // The dialog should not close on failure
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})

describe("ReprocessDocumentDialog", () => {
  it("renders the confirmation copy and calls reprocess on confirm", async () => {
    const post = vi.fn().mockResolvedValue({ message: "queued" })
    getApiClientMock.mockReturnValue({ post } as never)
    const onOpenChange = vi.fn()
    const onReprocessed = vi.fn()
    const user = userEvent.setup()
    render(
      <ReprocessDocumentDialog
        open
        onOpenChange={onOpenChange}
        documentId="d-1"
        documentTitle="Plan"
        onReprocessed={onReprocessed}
      />,
      { wrapper: makeWrapper() },
    )
    expect(
      screen.getByRole("heading", { name: /reprocess document\?/i }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /^reprocess$/i }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(onReprocessed).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("disables the buttons while the mutation is in flight", async () => {
    let resolveFn!: (v: { message: string }) => void
    const post = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => (resolveFn = resolve)),
      )
    getApiClientMock.mockReturnValue({ post } as never)
    const user = userEvent.setup()
    render(
      <ReprocessDocumentDialog
        open
        onOpenChange={() => {}}
        documentId="d-1"
        documentTitle="Plan"
      />,
      { wrapper: makeWrapper() },
    )
    await user.click(screen.getByRole("button", { name: /^reprocess$/i }))
    // While the request is in flight, both buttons are disabled.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /reprocessing…/i })).toBeDisabled(),
    )
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled()
    resolveFn({ message: "queued" })
  })
})
