import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@cortex/api-client"

const pushMock = vi.fn()
const postMock = vi.fn()

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }))
vi.mock("@/lib/auth/api-client", () => ({
  getApiClient: () => ({ post: postMock }),
  resetApiClient: vi.fn(),
}))

import { AcceptInviteForm } from "@/components/auth/AcceptInviteForm"
import { useAuthStore } from "@/lib/auth/store"

const session = {
  access_token: "at",
  refresh_token: "rt",
  token_type: "bearer",
  expires_in: 3600,
  user: { id: "u2", email: "bob@acme.dev", role: "member", tenant_id: "t1" },
  tenant: { id: "t1", slug: "acme", name: "Acme" },
}

describe("AcceptInviteForm", () => {
  beforeEach(() => {
    pushMock.mockReset()
    postMock.mockReset()
    useAuthStore.getState().clear()
  })

  it("redeems the token, signs in and lands on the dashboard", async () => {
    const user = userEvent.setup()
    postMock.mockResolvedValueOnce(session)
    render(<AcceptInviteForm token="tok_abc123456789" />)
    await user.type(screen.getByLabelText(/full name/i), "Bob")
    await user.type(screen.getByLabelText(/choose a password/i), "correct-horse")
    await user.click(screen.getByRole("button", { name: /join workspace/i }))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/app/dashboard"))
    expect(postMock).toHaveBeenCalledWith("/api/v1/auth/accept-invite", {
      token: "tok_abc123456789",
      password: "correct-horse",
      full_name: "Bob",
    })
    expect(useAuthStore.getState().accessToken).toBe("at")
  })

  it("rejects short passwords before calling the API", async () => {
    const user = userEvent.setup()
    render(<AcceptInviteForm token="tok_abc123456789" />)
    await user.type(screen.getByLabelText(/choose a password/i), "short")
    await user.click(screen.getByRole("button", { name: /join workspace/i }))
    expect(screen.getByRole("alert")).toHaveTextContent(/at least 8/i)
    expect(postMock).not.toHaveBeenCalled()
  })

  it("explains an invalid or used invitation", async () => {
    const user = userEvent.setup()
    postMock.mockRejectedValueOnce(new ApiError(401, { detail: "invalid invite" }))
    render(<AcceptInviteForm token="tok_abc123456789" />)
    await user.type(screen.getByLabelText(/choose a password/i), "correct-horse")
    await user.click(screen.getByRole("button", { name: /join workspace/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid, expired, or already used/i)
  })

  it("handles a link without a token", () => {
    render(<AcceptInviteForm token="" />)
    expect(screen.getByRole("alert")).toHaveTextContent(/incomplete/i)
  })
})
