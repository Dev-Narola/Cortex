/**
 * Unit tests for `OnboardingGuard` component.
 */

import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const replaceMock = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}))

import { OnboardingGuard } from "@/components/auth/OnboardingGuard"
import { useAuthStore } from "@/lib/auth/store"

describe("OnboardingGuard", () => {
  beforeEach(() => {
    replaceMock.mockReset()
    useAuthStore.getState().clear()
    useAuthStore.setState({ hydrated: true, restored: true, isRestoring: false })
  })

  afterEach(() => {
    useAuthStore.getState().clear()
  })

  it("renders loading state when not yet hydrated", () => {
    useAuthStore.setState({ hydrated: false })
    render(
      <OnboardingGuard>
        <div>dashboard content</div>
      </OnboardingGuard>,
    )
    expect(screen.getByText("Checking workspace access…")).toBeInTheDocument()
    expect(screen.queryByText("dashboard content")).not.toBeInTheDocument()
  })

  it("redirects unauthenticated user to login", async () => {
    render(
      <OnboardingGuard>
        <div>dashboard content</div>
      </OnboardingGuard>,
    )
    await Promise.resolve()
    expect(replaceMock).toHaveBeenCalledWith(expect.stringMatching(/\/login\?next=/))
  })

  it("redirects authenticated user without tenant to /workspace-setup", async () => {
    useAuthStore.setState({
      accessToken: "token-1",
      expiresAt: Date.now() + 60000,
      tenant: null,
      isOnboarded: false,
    })

    render(
      <OnboardingGuard>
        <div>dashboard content</div>
      </OnboardingGuard>,
    )
    await Promise.resolve()
    expect(replaceMock).toHaveBeenCalledWith("/workspace-setup")
  })

  it("renders children when authenticated and tenant exists", () => {
    useAuthStore.setState({
      accessToken: "token-1",
      expiresAt: Date.now() + 60000,
      tenant: { id: "t-1", slug: "acme", workspace: "Acme" },
      isOnboarded: true,
    })

    render(
      <OnboardingGuard>
        <div>dashboard content</div>
      </OnboardingGuard>,
    )

    expect(screen.getByText("dashboard content")).toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalled()
  })
})
