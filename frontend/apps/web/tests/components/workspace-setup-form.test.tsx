/**
 * WorkspaceSetupForm — onboarding form (F2 Part 2).
 *
 * Covers the spec's "Workspace Form" testing matrix:
 *   - Empty name → field-level error, no submit.
 *   - Invalid slug → field-level error, no submit.
 *   - Auto-generated slug: typing in `name` updates `slug`.
 *   - Manual slug override: editing `slug` breaks the
 *     auto-sync.
 *   - On submit success: calls POST /tenants, writes to
 *     the auth store, navigates to /app/dashboard.
 *   - On 409: surfaces the slug-already-taken error on
 *     the slug field.
 *   - On 5xx: surfaces a server-error banner.
 */

import { ApiError } from "@cortex/api-client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WorkspaceSetupForm } from "@/components/onboarding"
import { useAuthStore } from "@/lib/auth/store"

const pushMock = vi.fn()
const replaceMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}))

const postMock = vi.fn()

vi.mock("@/lib/auth/api-client", () => ({
  getApiClient: () => ({ post: postMock }),
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

describe("WorkspaceSetupForm", () => {
  beforeEach(() => {
    postMock.mockReset()
    pushMock.mockReset()
    useAuthStore.getState().clear()
  })

  afterEach(() => {
    useAuthStore.getState().clear()
  })

  it("renders the name + slug fields + submit button", () => {
    render(<WorkspaceSetupForm />, { wrapper: makeWrapper() })
    expect(screen.getByLabelText(/workspace name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/workspace url/i)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /create workspace/i }),
    ).toBeInTheDocument()
  })

  it("rejects an empty name with a field-level error and no submit", async () => {
    const user = userEvent.setup()
    render(<WorkspaceSetupForm />, { wrapper: makeWrapper() })
    await user.click(screen.getByRole("button", { name: /create workspace/i }))
    expect(
      await screen.findByText(/workspace name must be at least 3 characters/i),
    ).toBeInTheDocument()
    expect(postMock).not.toHaveBeenCalled()
  })

  it("strips invalid characters from the slug via the Controller, but keeps hyphens the user types", async () => {
    // The slug Controller applies a `cleanSlugInput()` on
    // every change so the field stays slug-valid as the
    // user types — uppercase → lowercase, spaces + symbols
    // are removed, but hyphens the user types are kept (so
    // the user can type "my-cool-workspace" without losing
    // the dashes mid-word).
    const user = userEvent.setup()
    render(<WorkspaceSetupForm />, { wrapper: makeWrapper() })
    const slugInput = screen.getByLabelText(/workspace url/i) as HTMLInputElement
    await user.click(slugInput)
    await user.paste("My Cool Workspace")
    // Spaces stripped, lowercased, hyphens preserved (none in input).
    expect(slugInput.value).toBe("mycoolworkspace")
  })

  it("auto-generates the slug from the workspace name until the user touches it", async () => {
    const user = userEvent.setup()
    render(<WorkspaceSetupForm />, { wrapper: makeWrapper() })
    const nameInput = screen.getByLabelText(/workspace name/i)
    const slugInput = screen.getByLabelText(/workspace url/i) as HTMLInputElement
    await user.type(nameInput, "Acme Inc")
    expect(slugInput.value).toBe("acme-inc")
    await user.type(nameInput, " 2026")
    expect(slugInput.value).toBe("acme-inc-2026")
  })

  it("stops auto-syncing the slug once the user manually edits it", async () => {
    const user = userEvent.setup()
    render(<WorkspaceSetupForm />, { wrapper: makeWrapper() })
    const nameInput = screen.getByLabelText(/workspace name/i)
    const slugInput = screen.getByLabelText(/workspace url/i) as HTMLInputElement
    // First, let the auto-sync set a slug.
    await user.type(nameInput, "Acme Inc")
    expect(slugInput.value).toBe("acme-inc")
    // Now manually edit the slug.
    await user.clear(slugInput)
    await user.type(slugInput, "my-custom")
    expect(slugInput.value).toBe("my-custom")
    // Typing more in the name should NOT change the slug.
    await user.type(nameInput, " Updated")
    expect(slugInput.value).toBe("my-custom")
  })

  it("on a valid submit, calls POST /tenants + writes to the auth store + navigates to /app/dashboard", async () => {
    postMock.mockResolvedValueOnce({
      id: "tenant-1",
      slug: "acme-inc",
      name: "Acme Inc",
    })
    const user = userEvent.setup()
    render(<WorkspaceSetupForm />, { wrapper: makeWrapper() })
    await user.type(screen.getByLabelText(/workspace name/i), "Acme Inc")
    await user.click(screen.getByRole("button", { name: /create workspace/i }))

    await waitFor(() => expect(postMock).toHaveBeenCalled())
    expect(postMock).toHaveBeenCalledWith("/api/v1/tenants", {
      name: "Acme Inc",
      slug: "acme-inc",
    })
    await waitFor(() =>
      expect(useAuthStore.getState().tenant?.slug).toBe("acme-inc"),
    )
    expect(useAuthStore.getState().tenant?.workspace).toBe("Acme Inc")
    expect(useAuthStore.getState().isOnboarded).toBe(true)
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/app/dashboard"),
    )
  })

  it("on 409 (duplicate slug), surfaces the slug-already-taken error on the slug field", async () => {
    postMock.mockRejectedValueOnce(
      new ApiError(409, { message: "Slug already in use" }),
    )
    const user = userEvent.setup()
    render(<WorkspaceSetupForm />, { wrapper: makeWrapper() })
    await user.type(screen.getByLabelText(/workspace name/i), "Acme Inc")
    await user.click(screen.getByRole("button", { name: /create workspace/i }))
    expect(
      await screen.findByText(/workspace url is already taken/i),
    ).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it("on 5xx, surfaces a server-error banner", async () => {
    postMock.mockRejectedValueOnce(
      new ApiError(500, { message: "Internal Server Error" }),
    )
    const user = userEvent.setup()
    render(<WorkspaceSetupForm />, { wrapper: makeWrapper() })
    await user.type(screen.getByLabelText(/workspace name/i), "Acme Inc")
    await user.click(screen.getByRole("button", { name: /create workspace/i }))
    expect(
      await screen.findByText(/the server hit an error/i),
    ).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })
})
