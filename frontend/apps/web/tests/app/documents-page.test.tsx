/**
 * Documents page — F3 Part 2 (Task 11).
 *
 * Verifies the four core states the page must surface:
 *   - Loading (spinner)
 *   - Empty (the "No documents yet" surface)
 *   - Error (the "Try again" surface, no row click)
 *   - Data (the table renders the rows)
 *
 * The page is a server component that mounts the
 * client `DocumentsView` — we test the view directly
 * to keep the React Query setup explicit.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DocumentsView } from "@/app/(app)/app/documents/DocumentsView"
import { FrontendError } from "@/lib/http/errors"
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
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: "d-1",
    title: "Hello.pdf",
    mime_type: "application/pdf",
    status: "indexed",
    created_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("DocumentsView", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders the page header", () => {
    getApiClientMock.mockReturnValue({
      get: vi.fn().mockReturnValue(new Promise(() => {})),
    } as never)
    render(<DocumentsView />, { wrapper: makeWrapper() })
    expect(
      screen.getByRole("heading", { name: /documents/i, level: 1 }),
    ).toBeInTheDocument()
  })

  it("renders the loading spinner while the initial fetch is in flight", () => {
    getApiClientMock.mockReturnValue({
      get: vi.fn().mockReturnValue(new Promise(() => {})),
    } as never)
    render(<DocumentsView />, { wrapper: makeWrapper() })
    // A spinner is a [role="status"] surface (per the view).
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  it("renders the empty state when the backend returns 0 items", async () => {
    getApiClientMock.mockReturnValue({
      get: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        limit: 50,
        offset: 0,
      }),
    } as never)
    render(<DocumentsView />, { wrapper: makeWrapper() })
    expect(await screen.findByText(/no documents yet/i)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /^upload document$/i }),
    ).toBeInTheDocument()
  })

  it("renders the error state when the service rejects", async () => {
    getApiClientMock.mockReturnValue({
      get: vi
        .fn()
        .mockRejectedValue(
          new FrontendError({ kind: "server", status: 500, message: "boom" }),
        ),
    } as never)
    render(<DocumentsView />, { wrapper: makeWrapper() })
    expect(
      await screen.findByText(/the server hit an error/i),
    ).toBeInTheDocument()
    // The error surface hides the toolbar so the user is
    // funneled to the retry button.
    expect(
      screen.queryByLabelText(/search documents/i),
    ).not.toBeInTheDocument()
  })

  it("calls refetch when the Try again button is clicked", async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(
        new FrontendError({ kind: "network", message: "offline" }),
      )
      .mockResolvedValueOnce({
        items: [],
        total: 0,
        limit: 50,
        offset: 0,
      })
    getApiClientMock.mockReturnValue({ get } as never)
    const user = userEvent.setup()
    render(<DocumentsView />, { wrapper: makeWrapper() })
    const retry = await screen.findByRole("button", { name: /try again/i })
    await user.click(retry)
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
  })

  it("renders the table when the backend returns rows", async () => {
    getApiClientMock.mockReturnValue({
      get: vi.fn().mockResolvedValue({
        items: [
          makeDoc({ id: "a", title: "Alpha" }),
          makeDoc({ id: "b", title: "Bravo", status: "failed" }),
        ],
        total: 2,
        limit: 50,
        offset: 0,
      }),
    } as never)
    render(<DocumentsView />, { wrapper: makeWrapper() })
    expect(await screen.findByText("Alpha")).toBeInTheDocument()
    expect(screen.getByText("Bravo")).toBeInTheDocument()
    expect(screen.getByText("Failed")).toBeInTheDocument()
  })
})
