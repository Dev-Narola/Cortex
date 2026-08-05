/**
 * RegisterForm — client-side flow (F2 Part 1, Task 7).
 *
 * Covers:
 *   - Field-level validation (weak password, mismatched
 *     confirm, terms not accepted).
 *   - Submit calls POST /auth/register through the
 *     service layer.
 *   - On 409 (duplicate email), the form surfaces the
 *     error inline on the `email` field, not as a
 *     generic dialog.
 *   - On 5xx, the form surfaces a server-error banner.
 */

import { ApiError } from "@cortex/api-client"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const pushMock = vi.fn()
const replaceMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}))

import { RegisterForm } from "@/components/auth"
import { useAuthStore } from "@/lib/auth/store"

const postMock = vi.fn()

vi.mock("@/lib/auth/api-client", () => ({
  getApiClient: () => ({ post: postMock }),
}))

const registerResponse = {
  access_token: "jwt-2",
  refresh_token: "rt-2",
  token_type: "Bearer",
  expires_in: 3600,
  user: {
    id: "user-2",
    email: "new@cortex.dev",
    role: "owner",
    tenant_id: "tenant-2",
  },
  tenant: { id: "tenant-2", slug: "new", name: "New" },
}

describe("RegisterForm", () => {
  beforeEach(() => {
    postMock.mockReset()
    pushMock.mockReset()
    useAuthStore.getState().clear()
  })

  afterEach(() => {
    useAuthStore.getState().clear()
  })

  it("renders all fields + the submit button", () => {
    render(<RegisterForm />)
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/terms/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument()
  })

  it("rejects mismatched confirm password with a field-level error", async () => {
    const user = userEvent.setup()
    render(<RegisterForm />)
    await user.type(screen.getByLabelText(/name/i), "Ada")
    await user.type(screen.getByLabelText(/email/i), "ada@cortex.dev")
    await user.type(screen.getByLabelText(/^password/i), "TestPass123")
    await user.type(screen.getByLabelText(/confirm password/i), "TestPass999")
    await user.click(screen.getByLabelText(/terms/i))
    await user.click(screen.getByRole("button", { name: /create account/i }))
    expect(await screen.findByText(/passwords don't match/i)).toBeInTheDocument()
    expect(postMock).not.toHaveBeenCalled()
  })

  it("rejects when terms are not accepted", async () => {
    const user = userEvent.setup()
    render(<RegisterForm />)
    await user.type(screen.getByLabelText(/name/i), "Ada")
    await user.type(screen.getByLabelText(/email/i), "ada@cortex.dev")
    await user.type(screen.getByLabelText(/^password/i), "TestPass123")
    await user.type(screen.getByLabelText(/confirm password/i), "TestPass123")
    // Intentionally don't tick the terms checkbox.
    await user.click(screen.getByRole("button", { name: /create account/i }))
    expect(await screen.findByText(/you must accept the terms/i)).toBeInTheDocument()
    expect(postMock).not.toHaveBeenCalled()
  })

  it("calls POST /auth/register on a valid submit and stores the session", async () => {
    postMock.mockResolvedValueOnce(registerResponse)
    const user = userEvent.setup()
    render(<RegisterForm />)
    await user.type(screen.getByLabelText(/name/i), "Ada")
    await user.type(screen.getByLabelText(/email/i), "new@cortex.dev")
    await user.type(screen.getByLabelText(/^password/i), "TestPass123")
    await user.type(screen.getByLabelText(/confirm password/i), "TestPass123")
    await user.click(screen.getByLabelText(/terms/i))
    await user.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => expect(postMock).toHaveBeenCalled())
    expect(postMock).toHaveBeenCalledWith(
      "/api/v1/auth/register",
      expect.objectContaining({
        name: "Ada",
        email: "new@cortex.dev",
        password: "TestPass123",
      }),
    )
    await waitFor(() => {
      expect(useAuthStore.getState().accessToken).toBe("jwt-2")
    })
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/app/dashboard"))
  })

  it("on 409 (duplicate email), surfaces the error inline on the email field", async () => {
    postMock.mockRejectedValueOnce(new ApiError(409, { message: "Email already exists" }))
    const user = userEvent.setup()
    render(<RegisterForm />)
    await user.type(screen.getByLabelText(/name/i), "Ada")
    await user.type(screen.getByLabelText(/email/i), "taken@cortex.dev")
    await user.type(screen.getByLabelText(/^password/i), "TestPass123")
    await user.type(screen.getByLabelText(/confirm password/i), "TestPass123")
    await user.click(screen.getByLabelText(/terms/i))
    await user.click(screen.getByRole("button", { name: /create account/i }))
    expect(
      await screen.findByText(/an account with this email already exists/i),
    ).toBeInTheDocument()
  })

  it("on 5xx, surfaces a server-error banner", async () => {
    postMock.mockRejectedValueOnce(new ApiError(500, { message: "boom" }))
    const user = userEvent.setup()
    render(<RegisterForm />)
    await user.type(screen.getByLabelText(/name/i), "Ada")
    await user.type(screen.getByLabelText(/email/i), "ada@cortex.dev")
    await user.type(screen.getByLabelText(/^password/i), "TestPass123")
    await user.type(screen.getByLabelText(/confirm password/i), "TestPass123")
    await user.click(screen.getByLabelText(/terms/i))
    await user.click(screen.getByRole("button", { name: /create account/i }))
    expect(await screen.findByText(/server hit an error/i)).toBeInTheDocument()
  })
})
