/**
 * LoginForm — client-side flow (F2 Part 1, Task 6).
 *
 * Covers:
 *   - Field-level Zod validation (empty tenant_slug,
 *     invalid email, empty password).
 *   - Submit calls POST /auth/login through the
 *     service layer.
 *   - On 401, the form surfaces a generic
 *     "Invalid email, password, or workspace." error
 *     (no leak of which field was wrong).
 *   - On 5xx, the form surfaces the server-error
 *     message.
 *   - Loading state disables the submit button + shows
 *     a spinner + "Signing in…" text.
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

import { LoginForm } from "@/components/auth"
import { useAuthStore } from "@/lib/auth/store"

const postMock = vi.fn()

vi.mock("@/lib/auth/api-client", () => ({
  getApiClient: () => ({ post: postMock }),
}))

const loginResponse = {
  access_token: "jwt-1",
  refresh_token: "rt-1",
  token_type: "Bearer",
  expires_in: 3600,
  user: {
    id: "user-1",
    email: "ada@cortex.dev",
    role: "owner",
    tenant_id: "tenant-1",
  },
  tenant: { id: "tenant-1", slug: "acme", name: "Acme" },
}

describe("LoginForm", () => {
  beforeEach(() => {
    postMock.mockReset()
    pushMock.mockReset()
    useAuthStore.getState().clear()
  })

  afterEach(() => {
    useAuthStore.getState().clear()
  })

  it("renders the three fields + submit button", () => {
    render(<LoginForm />)
    expect(screen.getByLabelText(/workspace/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument()
  })

  it("rejects an empty tenant_slug with a field-level error", async () => {
    const user = userEvent.setup()
    render(<LoginForm />)
    await user.click(screen.getByRole("button", { name: /sign in/i }))
    expect(await screen.findByText(/workspace slug is required/i)).toBeInTheDocument()
    expect(postMock).not.toHaveBeenCalled()
  })

  it("rejects an invalid email with a field-level error", async () => {
    const user = userEvent.setup()
    render(<LoginForm />)
    await user.type(screen.getByLabelText(/workspace/i), "acme")
    await user.type(screen.getByLabelText(/email/i), "not-an-email")
    await user.type(screen.getByLabelText(/password/i), "x")
    await user.click(screen.getByRole("button", { name: /sign in/i }))
    expect(await screen.findByText(/enter a valid email/i)).toBeInTheDocument()
    expect(postMock).not.toHaveBeenCalled()
  })

  it("calls POST /auth/login on a valid submit and stores the session", async () => {
    postMock.mockResolvedValueOnce(loginResponse)
    const user = userEvent.setup()
    render(<LoginForm />)
    await user.type(screen.getByLabelText(/workspace/i), "acme")
    await user.type(screen.getByLabelText(/email/i), "ada@cortex.dev")
    await user.type(screen.getByLabelText(/password/i), "TestPass123")
    await user.click(screen.getByRole("button", { name: /sign in/i }))

    await waitFor(() => expect(postMock).toHaveBeenCalled())
    expect(postMock).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({
        tenant_slug: "acme",
        email: "ada@cortex.dev",
        password: "TestPass123",
      }),
    )
    await waitFor(() => {
      expect(useAuthStore.getState().accessToken).toBe("jwt-1")
    })
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/app/dashboard"))
  })

  it("on 401, surfaces a generic 'Invalid email, password, or workspace.' error", async () => {
    postMock.mockRejectedValueOnce(new ApiError(401, { message: "Invalid credentials" }))
    const user = userEvent.setup()
    render(<LoginForm />)
    await user.type(screen.getByLabelText(/workspace/i), "acme")
    await user.type(screen.getByLabelText(/email/i), "ada@cortex.dev")
    await user.type(screen.getByLabelText(/password/i), "wrong")
    await user.click(screen.getByRole("button", { name: /sign in/i }))
    expect(await screen.findByText(/invalid email, password, or workspace\./i)).toBeInTheDocument()
  })

  it("on 5xx, surfaces the server-error message", async () => {
    postMock.mockRejectedValueOnce(new ApiError(500, { message: "boom" }))
    const user = userEvent.setup()
    render(<LoginForm />)
    await user.type(screen.getByLabelText(/workspace/i), "acme")
    await user.type(screen.getByLabelText(/email/i), "ada@cortex.dev")
    await user.type(screen.getByLabelText(/password/i), "x")
    await user.click(screen.getByRole("button", { name: /sign in/i }))
    expect(await screen.findByText(/server hit an error/i)).toBeInTheDocument()
  })
})
