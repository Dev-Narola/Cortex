/**
 * ConversationListItem + ConversationList — F5 Part 1.
 *
 * Covers:
 *   - renders title
 *   - active styling (data-active + aria-current)
 *   - inactive styling (no aria-current, no Ember rail)
 *   - clickable via native anchor (href includes /chat/{id})
 *   - long title is truncated (single line + title attr)
 *   - empty state has the start-conversation CTA
 *   - error state has the retry CTA
 *   - loading state has the role="status" + 6 skeleton rows
 *   - success state renders one <li> per conversation
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ConversationList } from "@/components/chat/history/ConversationList"
import { ConversationListItem } from "@/components/chat/history/ConversationListItem"
import type { Conversation } from "@/types/conversation"

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

describe("ConversationListItem", () => {
  it("renders the title + a link to /chat/{id}", () => {
    render(
      <ConversationListItem
        conversation={makeConversation({ id: "abc", title: "RAG notes" })}
        activeConversationId={null}
      />,
    )
    const link = screen.getByRole("link", { name: /rag notes/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", "/chat/abc")
  })

  it("marks the active row with data-active='true' + aria-current='page'", () => {
    render(
      <ConversationListItem
        conversation={makeConversation({ id: "abc" })}
        activeConversationId="abc"
      />,
    )
    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("data-active", "true")
    expect(link).toHaveAttribute("aria-current", "page")
  })

  it("does NOT mark inactive rows as active", () => {
    render(
      <ConversationListItem
        conversation={makeConversation({ id: "abc" })}
        activeConversationId="other"
      />,
    )
    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("data-active", "false")
    expect(link).not.toHaveAttribute("aria-current")
  })

  it("URL-encodes ids that contain special characters", () => {
    render(
      <ConversationListItem
        conversation={makeConversation({ id: "a/b c" })}
        activeConversationId={null}
      />,
    )
    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("href", "/chat/a%2Fb%20c")
  })

  it("truncates a long title to one line + keeps the full title in `title`", () => {
    const longTitle =
      "Understanding how Cortex's hybrid retrieval pipeline combines BM25, pgvector, reranking and the knowledge graph"
    const { container } = render(
      <ConversationListItem
        conversation={makeConversation({ title: longTitle })}
        activeConversationId={null}
      />,
    )
    // The visible text node carries the full
    // title (the browser applies the truncation
    // via CSS, not by removing characters).
    expect(screen.getByText(longTitle)).toBeInTheDocument()
    // The native tooltip attr carries the same
    // full string for the browser tooltip.
    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("title", longTitle)
    // The inner span has the truncation class
    // (text-ellipsis is applied via CSS).
    const titleSpan = container.querySelector(
      "[data-conversation-title]",
    )
    expect(titleSpan?.className).toMatch(/truncate/)
  })
})

describe("ConversationList", () => {
  it("renders the loading skeleton with role=status + 6 rows", () => {
    const { container } = render(
      <ConversationList
        conversations={undefined}
        isLoading={true}
        error={null}
        activeConversationId={null}
        onRetry={() => {}}
        onStartConversation={() => {}}
      />,
    )
    expect(
      screen.getByRole("status", { name: /loading conversations/i }),
    ).toBeInTheDocument()
    expect(container.querySelectorAll("[data-skeleton-row]").length).toBe(6)
  })

  it("renders the empty state with a start-conversation CTA when the list is empty", async () => {
    const onStart = vi.fn()
    const user = userEvent.setup()
    render(
      <ConversationList
        conversations={[]}
        isLoading={false}
        error={null}
        activeConversationId={null}
        onRetry={() => {}}
        onStartConversation={onStart}
      />,
    )
    expect(
      screen.getByText(/no conversations yet/i),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: /start a conversation/i }),
    )
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it("renders the error state with a working Retry CTA", async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(
      <ConversationList
        conversations={undefined}
        isLoading={false}
        error={new Error("Network unreachable")}
        activeConversationId={null}
        onRetry={onRetry}
        onStartConversation={() => {}}
      />,
    )
    expect(
      screen.getByRole("alert"),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/couldn't load conversations/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/network unreachable/i),
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("renders one <li> per conversation in the success state", () => {
    const conversations = [
      makeConversation({ id: "a", title: "A" }),
      makeConversation({ id: "b", title: "B" }),
      makeConversation({ id: "c", title: "C" }),
    ]
    render(
      <ConversationList
        conversations={conversations}
        isLoading={false}
        error={null}
        activeConversationId="b"
        onRetry={() => {}}
        onStartConversation={() => {}}
      />,
    )
    const items = screen.getAllByRole("link")
    expect(items).toHaveLength(3)
    // The active row is the second one.
    expect(items[1]).toHaveAttribute("data-active", "true")
    expect(items[1]).toHaveAttribute("aria-current", "page")
  })

  it("emits the correct data attribute for each state", () => {
    const { rerender } = render(
      <ConversationList
        conversations={undefined}
        isLoading={true}
        error={null}
        activeConversationId={null}
        onRetry={() => {}}
        onStartConversation={() => {}}
      />,
    )
    expect(
      document.querySelector("[data-conversation-list='loading']"),
    ).toBeInTheDocument()

    rerender(
      <ConversationList
        conversations={undefined}
        isLoading={false}
        error={new Error("boom")}
        activeConversationId={null}
        onRetry={() => {}}
        onStartConversation={() => {}}
      />,
    )
    expect(
      document.querySelector("[data-conversation-list='error']"),
    ).toBeInTheDocument()

    rerender(
      <ConversationList
        conversations={[]}
        isLoading={false}
        error={null}
        activeConversationId={null}
        onRetry={() => {}}
        onStartConversation={() => {}}
      />,
    )
    expect(
      document.querySelector("[data-conversation-list='empty']"),
    ).toBeInTheDocument()

    rerender(
      <ConversationList
        conversations={[makeConversation()]}
        isLoading={false}
        error={null}
        activeConversationId={null}
        onRetry={() => {}}
        onStartConversation={() => {}}
      />,
    )
    expect(
      document.querySelector("[data-conversation-list='ready']"),
    ).toBeInTheDocument()
  })
})
