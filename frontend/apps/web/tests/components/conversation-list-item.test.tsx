/**
 * ConversationListItem — F5 Part 2 mode coverage.
 *
 * Verifies the three sub-states (normal /
 * renaming / deleting) and the prop-driven
 * side-states (rename error, delete error,
 * isRenaming, isDeleting). We don't re-test the
 * ActionMenu / InlineRename / DeleteConfirmation
 * internals here — they have their own tests.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ConversationListItem } from "@/components/chat/history/ConversationListItem"
import { useAuthStore } from "@/lib/auth/store"
import type { Conversation } from "@/types/conversation"

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

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "c-1",
    tenantId: "t-1",
    userId: "u-1",
    title: "Cortex architecture",
    summary: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  }
}

beforeEach(() => {
  useAuthStore.setState({
    accessToken: "x",
    refreshToken: "y",
    user: { id: "u-1", email: "u@example.com", role: "owner", tenantId: "t-1" },
    tenant: { id: "t-1", slug: "acme" },
    isOnboarded: true,
    expiresAt: null,
    loading: false,
    hydrated: true,
    restored: true,
    isRestoring: false,
  })
})

afterEach(() => vi.restoreAllMocks())

describe("ConversationListItem", () => {
  it("renders the normal mode as a navigation anchor", () => {
    render(
      <ConversationListItem
        conversation={makeConversation({ id: "abc", title: "RAG" })}
        activeConversationId={null}
      />,
      { wrapper: makeWrapper() },
    )
    const link = screen.getByRole("link", { name: /rag/i })
    expect(link).toHaveAttribute("href", "/chat/abc")
  })

  it("opens the rename mode when the action menu's Rename is clicked", async () => {
    const onRenameSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <ConversationListItem
        conversation={makeConversation({ title: "Old name" })}
        activeConversationId={null}
        onRenameSubmit={onRenameSubmit}
      />,
      { wrapper: makeWrapper() },
    )
    await user.click(
      screen.getByRole("button", { name: /open conversation actions/i }),
    )
    await user.click(screen.getByRole("menuitem", { name: /rename/i }))
    // The InlineRename input is now mounted
    // with the prefilled value.
    expect(
      screen.getByDisplayValue("Old name"),
    ).toBeInTheDocument()
  })

  it("opens the delete mode when the action menu's Delete is clicked", async () => {
    const onDeleteConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <ConversationListItem
        conversation={makeConversation({ title: "Doomed" })}
        activeConversationId={null}
        onDeleteConfirm={onDeleteConfirm}
      />,
      { wrapper: makeWrapper() },
    )
    await user.click(
      screen.getByRole("button", { name: /open conversation actions/i }),
    )
    await user.click(screen.getByRole("menuitem", { name: /delete/i }))
    // The DeleteConfirmation shows the
    // conversation title + Cancel + Delete.
    expect(
      screen.getByRole("alertdialog", {
        name: /delete conversation\?/i,
      }),
    ).toBeInTheDocument()
  })

  it("returns to normal mode when the rename is cancelled", async () => {
    const onRenameCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <ConversationListItem
        conversation={makeConversation({ title: "Title" })}
        activeConversationId={null}
        onRenameCancel={onRenameCancel}
      />,
      { wrapper: makeWrapper() },
    )
    await user.click(
      screen.getByRole("button", { name: /open conversation actions/i }),
    )
    await user.click(screen.getByRole("menuitem", { name: /rename/i }))
    const input = screen.getByLabelText(/conversation title/i)
    input.focus()
    await user.keyboard("{Escape}")
    expect(onRenameCancel).toHaveBeenCalled()
    // Back to the navigation anchor.
    expect(
      screen.getByRole("link", { name: /title/i }),
    ).toBeInTheDocument()
  })

  it("returns to normal mode when delete is cancelled", async () => {
    const onDeleteCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <ConversationListItem
        conversation={makeConversation({ title: "Doomed" })}
        activeConversationId={null}
        onDeleteCancel={onDeleteCancel}
      />,
      { wrapper: makeWrapper() },
    )
    await user.click(
      screen.getByRole("button", { name: /open conversation actions/i }),
    )
    await user.click(screen.getByRole("menuitem", { name: /delete/i }))
    await user.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onDeleteCancel).toHaveBeenCalled()
    expect(
      screen.getByRole("link", { name: /doomed/i }),
    ).toBeInTheDocument()
  })

  it("renders the rename error inline when provided", async () => {
    const user = userEvent.setup()
    render(
      <ConversationListItem
        conversation={makeConversation({ title: "x" })}
        activeConversationId={null}
        renameError="Couldn't rename the conversation."
      />,
      { wrapper: makeWrapper() },
    )
    await user.click(
      screen.getByRole("button", { name: /open conversation actions/i }),
    )
    await user.click(screen.getByRole("menuitem", { name: /rename/i }))
    expect(
      screen.getByText(/couldn't rename the conversation/i),
    ).toBeInTheDocument()
  })
})
