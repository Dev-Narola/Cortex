import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@cortex/api-client"

const postMock = vi.fn()
vi.mock("@/lib/auth/api-client", () => ({
  getApiClient: () => ({ post: postMock }),
  resetApiClient: vi.fn(),
}))

import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm"

describe("ResetPasswordForm", () => {
  beforeEach(() => postMock.mockReset())

  it("sets the new password with the token, then offers sign-in", async () => {
    const user = userEvent.setup()
    postMock.mockResolvedValueOnce(undefined)
    render(<ResetPasswordForm token="rst_abc123456789" />)
    await user.type(screen.getByLabelText("New password"), "correct-horse")
    await user.type(screen.getByLabelText("Confirm new password"), "correct-horse")
    await user.click(screen.getByRole("button", { name: /set new password/i }))
    expect(postMock).toHaveBeenCalledWith("/api/v1/auth/reset-password", {
      token: "rst_abc123456789",
      password: "correct-horse",
    })
    expect(await screen.findByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login")
  })

  it("checks length and confirmation before calling the API", async () => {
    const user = userEvent.setup()
    render(<ResetPasswordForm token="rst_abc123456789" />)
    await user.type(screen.getByLabelText("New password"), "correct-horse")
    await user.type(screen.getByLabelText("Confirm new password"), "correct-horsf")
    await user.click(screen.getByRole("button", { name: /set new password/i }))
    expect(screen.getByRole("alert")).toHaveTextContent(/don't match/i)
    expect(postMock).not.toHaveBeenCalled()
  })

  it("explains a used or expired link", async () => {
    const user = userEvent.setup()
    postMock.mockRejectedValueOnce(new ApiError(401, { message: "used" }))
    render(<ResetPasswordForm token="rst_abc123456789" />)
    await user.type(screen.getByLabelText("New password"), "correct-horse")
    await user.type(screen.getByLabelText("Confirm new password"), "correct-horse")
    await user.click(screen.getByRole("button", { name: /set new password/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid, expired, or already used/i)
  })
})
