/**
 * GenerateApiKeyModal — F7 Part 2.
 *
 * Tests the generate-form contract:
 *   - RHF + Zod: empty / too-long name produce
 *     an inline error (no submit).
 *   - Valid name: POST /api-keys fires with the
 *     trimmed name.
 *   - Submitting: button reads "Generating…"
 *     and is disabled.
 *   - Parent receives the resolved
 *     `ApiKeyCreated` via `onCreated` (which
 *     includes the one-time `raw_key`).
 *
 * The api-client is mocked at the seam (Task 42).
 * The Toaster is mounted so error toasts have
 * somewhere to render; the tests don't assert on
 * the toast DOM (the assertion is on the
 * api-client call + the form state).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GenerateApiKeyModal } from "@/components/settings/api-keys/generate-api-key-modal"
import type { ApiKeyCreated } from "@/services/api-keys"

const postMock = vi.fn()

vi.mock("@/lib/auth/api-client", () => ({
  getApiClient: () => ({ get: vi.fn(), post: postMock, delete: vi.fn() }),
}))

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

function Harness({ onCreated }: { onCreated?: (created: ApiKeyCreated) => void }) {
  return (
    <div>
      <GenerateApiKeyModal open onOpenChange={() => {}} onCreated={onCreated} />
    </div>
  )
}

beforeEach(() => {
  postMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("GenerateApiKeyModal", () => {
  it("renders the modal when open=true", () => {
    render(<Harness />, { wrapper: makeWrapper() })
    expect(screen.getByTestId("generate-api-key-modal")).toBeInTheDocument()
    expect(screen.getByTestId("api-key-name-input")).toBeInTheDocument()
  })

  it("shows an inline error when the name is empty (Task 12)", async () => {
    render(<Harness />, { wrapper: makeWrapper() })
    fireEvent.click(screen.getByTestId("api-key-submit"))
    expect(
      await screen.findByTestId("api-key-name-error", {}, { timeout: 2000 }),
    ).toHaveTextContent(/required/i)
    expect(postMock).not.toHaveBeenCalled()
  })

  it("rejects names over 255 characters (mirrors backend's 1-255 cap)", async () => {
    const user = userEvent.setup()
    render(<Harness />, { wrapper: makeWrapper() })
    const input = screen.getByTestId("api-key-name-input") as HTMLInputElement
    // Use the native input value setter for a
    // long string — `userEvent.type` would
    // fire 256 keystrokes and exceed the
    // default test timeout.
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set
    nativeSetter?.call(input, "x".repeat(256))
    input.dispatchEvent(new Event("input", { bubbles: true }))
    fireEvent.click(screen.getByTestId("api-key-submit"))
    expect(
      await screen.findByTestId("api-key-name-error", {}, { timeout: 2000 }),
    ).toHaveTextContent(/255/i)
    expect(postMock).not.toHaveBeenCalled()
    // Suppress the unused-var lint by reading it.
    void user
  })

  it("calls POST /api-keys with the trimmed name (Task 42)", async () => {
    const user = userEvent.setup()
    const created: ApiKeyCreated = {
      id: "k-new",
      tenant_id: "t-1",
      name: "CI Pipeline",
      scopes: [],
      last_used_at: null,
      revoked_at: null,
      created_at: "2026-08-19T00:00:00Z",
      raw_key: "cx_live_TESTONLY",
    }
    const onCreated = vi.fn()
    postMock.mockResolvedValueOnce(created)
    render(<Harness onCreated={onCreated} />, { wrapper: makeWrapper() })
    const input = screen.getByTestId("api-key-name-input")
    await user.type(input, "  CI Pipeline  ") // whitespace should be trimmed
    fireEvent.click(screen.getByTestId("api-key-submit"))
    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        "/api/v1/api-keys",
        { name: "CI Pipeline" },
        expect.objectContaining({}),
      )
    })
    // The parent receives the full ApiKeyCreated
    // — including the one-time raw_key. The
    // parent drives the reveal modal.
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(created)
    })
  })

  it("shows 'Generating…' + disables the submit while in flight (Task 14)", async () => {
    const user = userEvent.setup()
    postMock.mockImplementationOnce(() => new Promise(() => {}))
    render(<Harness />, { wrapper: makeWrapper() })
    const input = screen.getByTestId("api-key-name-input")
    await user.type(input, "My Key")
    fireEvent.click(screen.getByTestId("api-key-submit"))
    await waitFor(() => {
      expect(screen.getByTestId("api-key-submit")).toHaveTextContent(/Generating/i)
    })
    expect(screen.getByTestId("api-key-submit")).toBeDisabled()
  })

  it("preserves the name on a 422 error (Task 31 — recoverable error)", async () => {
    const user = userEvent.setup()
    const { ApiError } = await import("@cortex/api-client")
    postMock.mockRejectedValueOnce(new ApiError(422, { message: "Bad name" }))
    render(<Harness />, { wrapper: makeWrapper() })
    const input = screen.getByTestId("api-key-name-input") as HTMLInputElement
    await user.type(input, "Teammate")
    fireEvent.click(screen.getByTestId("api-key-submit"))
    await screen.findByTestId("api-key-name-error", {}, { timeout: 2000 })
    expect(input.value).toBe("Teammate")
  })
})
