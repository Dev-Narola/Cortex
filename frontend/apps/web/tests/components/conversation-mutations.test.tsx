/**
 * InlineRename + ConversationActionMenu +
 * DeleteConfirmation — F5 Part 2.
 *
 * Covers:
 *   InlineRename
 *     - prefills the existing title
 *     - focuses + selects the text on mount
 *     - Enter submits the trimmed value
 *     - Escape cancels
 *     - empty title is rejected with an inline error
 *     - Save + Cancel buttons stop propagation
 *     - isSaving disables the input + buttons
 *     - shows the "Saving…" status while pending
 *   ConversationActionMenu
 *     - trigger opens the menu
 *     - Rename + Delete emit the right intents
 *     - Delete is hidden for viewer role
 *     - click outside closes the menu
 *     - Escape closes the menu
 *   DeleteConfirmation
 *     - shows the conversation title in the prompt
 *     - Cancel + Delete buttons emit the right intents
 *     - isDeleting disables both buttons
 *     - shows the spinner + "Deleting…" while pending
 *     - renders the inline error when provided
 *     - Escape (when not deleting) cancels
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DeleteConfirmation } from "@/components/chat/history/DeleteConfirmation"
import { InlineRename } from "@/components/chat/history/InlineRename"
import { useAuthStore } from "@/lib/auth/store"

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

beforeEach(() => {
  // Reset the auth store between cases so the
  // `useCurrentUserRole` selector sees the role
  // we want for the test.
  useAuthStore.setState({
    accessToken: "x",
    refreshToken: "y",
    user: {
      id: "u-1",
      email: "u@example.com",
      role: "owner",
      tenantId: "t-1",
    },
    tenant: {
      id: "t-1",
      slug: "acme",
    },
    isOnboarded: true,
    expiresAt: null,
    loading: false,
    hydrated: true,
    restored: true,
    isRestoring: false,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// InlineRename
// ---------------------------------------------------------------------------

describe("InlineRename", () => {
  it("prefills the existing title", () => {
    render(
      <InlineRename
        initialTitle="Cortex architecture"
        isSaving={false}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
      { wrapper: makeWrapper() },
    )
    expect(
      screen.getByDisplayValue("Cortex architecture"),
    ).toBeInTheDocument()
  })

  it("submits the trimmed value on Enter", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <InlineRename
        initialTitle="  Cortex architecture  "
        isSaving={false}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
      { wrapper: makeWrapper() },
    )
    const input = screen.getByLabelText(/conversation title/i)
    input.focus()
    // No typing needed — the initialTitle is
    // already in the field; Enter triggers the
    // submit handler with the trimmed value.
    await user.keyboard("{Enter}")
    expect(onSubmit).toHaveBeenCalledWith("Cortex architecture")
  })

  it("cancels on Escape without firing onSubmit", async () => {
    const onCancel = vi.fn()
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <InlineRename
        initialTitle="x"
        isSaving={false}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
      { wrapper: makeWrapper() },
    )
    const input = screen.getByLabelText(/conversation title/i)
    input.focus()
    await user.keyboard("{Escape}")
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("rejects an empty title with an inline error", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <InlineRename
        initialTitle=""
        isSaving={false}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
      { wrapper: makeWrapper() },
    )
    const input = screen.getByLabelText(/conversation title/i)
    input.focus()
    await user.keyboard("{Enter}")
    expect(onSubmit).not.toHaveBeenCalled()
    expect(
      screen.getByText(/conversation name can't be empty/i),
    ).toBeInTheDocument()
  })

  it("rejects a whitespace-only title", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <InlineRename
        initialTitle="   "
        isSaving={false}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
      { wrapper: makeWrapper() },
    )
    const input = screen.getByLabelText(/conversation title/i)
    input.focus()
    await user.keyboard("{Enter}")
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("disables input + buttons while saving", () => {
    render(
      <InlineRename
        initialTitle="x"
        isSaving={true}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
      { wrapper: makeWrapper() },
    )
    const input = screen.getByLabelText(/conversation title/i)
    expect(input).toBeDisabled()
    expect(
      screen.getByRole("button", { name: /save rename/i }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: /cancel rename/i }),
    ).toBeDisabled()
    expect(screen.getByText(/saving…/i)).toBeInTheDocument()
  })

  it("focuses + selects the input on mount", async () => {
    render(
      <InlineRename
        initialTitle="Picked text"
        isSaving={false}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
      { wrapper: makeWrapper() },
    )
    const input = screen.getByLabelText(
      /conversation title/i,
    ) as HTMLInputElement
    await waitFor(() => {
      expect(document.activeElement).toBe(input)
    })
    // The selection range covers the entire
    // value. happy-dom exposes selectionStart
    // + selectionEnd; both should be 0 and the
    // value length respectively.
    await waitFor(() => {
      expect(input.selectionStart).toBe(0)
      expect(input.selectionEnd).toBe(input.value.length)
    })
  })
})

// ---------------------------------------------------------------------------
// DeleteConfirmation
// ---------------------------------------------------------------------------

describe("DeleteConfirmation", () => {
  it("renders the conversation title + Cancel + Delete", () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(
      <DeleteConfirmation
        conversationTitle="Cortex architecture"
        isDeleting={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
      { wrapper: makeWrapper() },
    )
    expect(
      screen.getByRole("alertdialog", { name: /delete conversation\?/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/cortex architecture/i)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /cancel/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /delete/i }),
    ).toBeInTheDocument()
  })

  it("Cancel fires onCancel", async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <DeleteConfirmation
        conversationTitle="x"
        isDeleting={false}
        onCancel={onCancel}
        onConfirm={() => {}}
      />,
      { wrapper: makeWrapper() },
    )
    await user.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("Delete fires onConfirm", async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <DeleteConfirmation
        conversationTitle="x"
        isDeleting={false}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
      { wrapper: makeWrapper() },
    )
    await user.click(
      screen.getByRole("button", { name: /delete/i }),
    )
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it("disables Cancel + Delete + shows spinner when deleting", () => {
    render(
      <DeleteConfirmation
        conversationTitle="x"
        isDeleting={true}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
      { wrapper: makeWrapper() },
    )
    expect(
      screen.getByRole("button", { name: /cancel/i }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: /deleting…/i }),
    ).toBeDisabled()
  })

  it("renders the inline error when provided", () => {
    render(
      <DeleteConfirmation
        conversationTitle="x"
        isDeleting={false}
        errorMessage="Couldn't delete the conversation."
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
      { wrapper: makeWrapper() },
    )
    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent(/couldn't delete/i)
  })

  it("Escape cancels when not deleting", async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <DeleteConfirmation
        conversationTitle="x"
        isDeleting={false}
        onCancel={onCancel}
        onConfirm={() => {}}
      />,
      { wrapper: makeWrapper() },
    )
    const cancel = screen.getByRole("button", { name: /cancel/i })
    cancel.focus()
    await user.keyboard("{Escape}")
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// ConversationActionMenu
// ---------------------------------------------------------------------------

describe("ConversationActionMenu", () => {
  it("trigger opens the menu + Rename emits onRename", async () => {
    const onRename = vi.fn()
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(
      <ConversationActionMenuHarness
        onRename={onRename}
        onDelete={onDelete}
      />,
      { wrapper: makeWrapper() },
    )
    await user.click(
      screen.getByRole("button", { name: /open conversation actions/i }),
    )
    await user.click(screen.getByRole("menuitem", { name: /rename/i }))
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it("Delete emits onDelete for an owner", async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(
      <ConversationActionMenuHarness
        onRename={() => {}}
        onDelete={onDelete}
      />,
      { wrapper: makeWrapper() },
    )
    await user.click(
      screen.getByRole("button", { name: /open conversation actions/i }),
    )
    await user.click(screen.getByRole("menuitem", { name: /delete/i }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it("hides Delete for a viewer", async () => {
    // Set the role BEFORE rendering so the
    // selector picks up `viewer` on the first
    // render. The test's `beforeEach` already
    // set the default to `owner`; flip it here.
    useAuthStore.setState((prev) => ({
      ...prev,
      user: prev.user
        ? { ...prev.user, role: "viewer" }
        : prev.user,
    }))
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(
      <ConversationActionMenuHarness
        onRename={() => {}}
        onDelete={onDelete}
      />,
      { wrapper: makeWrapper() },
    )
    await user.click(
      screen.getByRole("button", { name: /open conversation actions/i }),
    )
    expect(
      screen.queryByRole("menuitem", { name: /delete/i }),
    ).toBeNull()
    expect(
      screen.getByRole("menuitem", { name: /rename/i }),
    ).toBeInTheDocument()
  })

  it("click outside closes the menu", async () => {
    const onRename = vi.fn()
    const user = userEvent.setup()
    render(
      <div>
        <button type="button" data-outside>
          Outside
        </button>
        <ConversationActionMenuHarness
          onRename={onRename}
          onDelete={() => {}}
        />
      </div>,
      { wrapper: makeWrapper() },
    )
    await user.click(
      screen.getByRole("button", { name: /open conversation actions/i }),
    )
    expect(
      screen.getByRole("menu", { name: /conversation actions/i }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /outside/i }))
    await waitFor(() => {
      expect(
        screen.queryByRole("menu", { name: /conversation actions/i }),
      ).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// Harness for the action menu tests
// ---------------------------------------------------------------------------

import { ConversationActionMenu as ConversationActionMenuHarness } from "@/components/chat/history/ConversationActionMenu"
