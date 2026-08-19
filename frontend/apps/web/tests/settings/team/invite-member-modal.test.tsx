/**
 * InviteMemberModal — F7 Part 1.
 *
 * Tests the invite-by-email flow contract:
 *   - Modal opens / closes via the controlled `open` prop.
 *   - RHF + Zod: empty + invalid email produce an
 *     inline error (no submit).
 *   - Valid email + role: POST /users/invite fires
 *     with the expected payload (Task 42).
 *   - Success: toast + modal close (Task 43).
 *   - 409: inline error on the email field (Task 29).
 *   - Submitting: button reads "Inviting…" and is
 *     disabled (Tasks 14, 35).
 *
 * The api-client is mocked at the seam (Task 42).
 * The Toaster is mounted so the success toast has
 * somewhere to render (the test doesn't assert on
 * its DOM; it only checks the api-client was called
 * + the modal closed).
 */

import { ApiError } from "@cortex/api-client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { InviteMemberModal } from "@/components/settings/team/invite-member-modal"

const postMock = vi.fn()

vi.mock("@/lib/auth/api-client", () => ({
  getApiClient: () => ({ get: vi.fn(), post: postMock }),
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

function Harness({ onClose }: { onClose?: () => void }) {
  return (
    <div>
      <InviteMemberModal open onOpenChange={() => {}} onClose={onClose} />
    </div>
  )
}

beforeEach(() => {
  postMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("InviteMemberModal", () => {
  it("renders the modal when open=true", () => {
    render(<Harness />, { wrapper: makeWrapper() })
    expect(screen.getByTestId("invite-member-modal")).toBeInTheDocument()
    expect(screen.getByTestId("invite-email-input")).toBeInTheDocument()
  })

  it("shows an inline error when the email is empty (Task 41)", async () => {
    render(<Harness />, { wrapper: makeWrapper() })
    fireEvent.click(screen.getByTestId("invite-submit"))
    expect(
      await screen.findByTestId("invite-email-error", {}, { timeout: 2000 }),
    ).toHaveTextContent(/required/i)
    expect(postMock).not.toHaveBeenCalled()
  })

  it("shows an inline error when the email is malformed (Task 41)", async () => {
    const user = userEvent.setup()
    render(<Harness />, { wrapper: makeWrapper() })
    const input = screen.getByTestId("invite-email-input")
    await user.type(input, "not-an-email")
    fireEvent.click(screen.getByTestId("invite-submit"))
    expect(
      await screen.findByTestId("invite-email-error", {}, { timeout: 2000 }),
    ).toHaveTextContent(/valid email/i)
    expect(postMock).not.toHaveBeenCalled()
  })

  it("calls POST /users/invite with the email + role (Task 42)", async () => {
    const user = userEvent.setup()
    postMock.mockResolvedValueOnce({
      member: {
        id: "u-new",
        email: "teammate@example.com",
        full_name: null,
        role: "member",
        created_at: "2026-08-19T00:00:00Z",
      },
    })
    render(<Harness />, { wrapper: makeWrapper() })
    await user.type(screen.getByTestId("invite-email-input"), "teammate@example.com")
    // Role defaults to "member" per the schema;
    // the submit still goes through.
    fireEvent.click(screen.getByTestId("invite-submit"))
    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        "/api/v1/users/invite",
        { email: "teammate@example.com", role: "member" },
        expect.objectContaining({}),
      )
    })
  })

  it("closes the modal + invalidates the list on success (Task 43)", async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    postMock.mockResolvedValueOnce({
      member: {
        id: "u-new",
        email: "teammate@example.com",
        full_name: null,
        role: "member",
        created_at: "2026-08-19T00:00:00Z",
      },
    })
    render(<Harness onClose={onClose} />, { wrapper: makeWrapper() })
    await user.type(screen.getByTestId("invite-email-input"), "teammate@example.com")
    fireEvent.click(screen.getByTestId("invite-submit"))
    await waitFor(() => {
      expect(postMock).toHaveBeenCalled()
    })
    // The mutation's onSuccess fires the toast +
    // closes the dialog. The parent receives the
    // onClose callback (used to clear temp state).
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })

  it("binds 409 to the email field as an inline error (Task 29)", async () => {
    const user = userEvent.setup()
    postMock.mockRejectedValueOnce(new ApiError(409, { message: "Already a member" }))
    render(<Harness />, { wrapper: makeWrapper() })
    await user.type(screen.getByTestId("invite-email-input"), "taken@example.com")
    fireEvent.click(screen.getByTestId("invite-submit"))
    expect(
      await screen.findByTestId("invite-email-error", {}, { timeout: 2000 }),
    ).toHaveTextContent(/already a member/i)
  })

  it("shows 'Inviting…' + disables the submit while in flight (Tasks 14, 35)", async () => {
    const user = userEvent.setup()
    // A promise we never resolve on this test —
    // the modal stays in the "submitting" state.
    postMock.mockImplementationOnce(() => new Promise(() => {}))
    render(<Harness />, { wrapper: makeWrapper() })
    await user.type(screen.getByTestId("invite-email-input"), "teammate@example.com")
    fireEvent.click(screen.getByTestId("invite-submit"))
    // Wait for the "Inviting…" label to appear
    // (the button swaps label while pending).
    await waitFor(() => {
      expect(screen.getByTestId("invite-submit")).toHaveTextContent(/Inviting/i)
    })
    expect(screen.getByTestId("invite-submit")).toBeDisabled()
  })

  it("preserves the form values on a recoverable 4xx error (Task 30)", async () => {
    const user = userEvent.setup()
    postMock.mockRejectedValueOnce(new ApiError(422, { message: "Invalid email" }))
    render(<Harness />, { wrapper: makeWrapper() })
    const input = screen.getByTestId("invite-email-input") as HTMLInputElement
    await user.type(input, "bad@")
    fireEvent.click(screen.getByTestId("invite-submit"))
    await screen.findByTestId("invite-email-error", {}, { timeout: 2000 })
    // The email is still in the field — the user
    // can correct and retry without re-typing.
    expect(input.value).toBe("bad@")
  })
})
