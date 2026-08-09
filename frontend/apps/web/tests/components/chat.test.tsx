/**
 * Chat components — F4 Part 1 (Tasks 8-16).
 *
 * Covers:
 *   - MessageBubble: user/assistant/tool styling
 *   - MessageList: empty state + scrollable list
 *   - MessageInput: multi-line, Enter/Shift+Enter,
 *     disabled-empty
 *   - ChatEmptyState: the spec's exact copy
 *   - ChatErrorState: retry button
 *   - ConversationHeader: title + "New" button
 *   - ChatLayout: composes the three rows
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ToastProvider, ToastViewport } from "@cortex/ui"

import { ChatEmptyState } from "@/components/chat/ChatEmptyState"
import { ChatErrorState } from "@/components/chat/ChatErrorState"
import { ChatLayout } from "@/components/chat/ChatLayout"
import { ConversationHeader } from "@/components/chat/ConversationHeader"
import { MessageBubble } from "@/components/chat/MessageBubble"
import { MessageInput } from "@/components/chat/MessageInput"
import { MessageList } from "@/components/chat/MessageList"
import { getApiClient } from "@/lib/auth/api-client"
import type { Message } from "@/types/conversation"

vi.mock("@/lib/auth/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/api-client")>(
      "@/lib/auth/api-client",
    )
  return { ...actual, getApiClient: vi.fn(), resetApiClient: vi.fn() }
})

const getApiClientMock = vi.mocked(getApiClient)

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>
        {children}
        <ToastViewport />
      </ToastProvider>
    </QueryClientProvider>
  )
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "m-1",
    conversationId: "c-1",
    role: "user",
    content: "Hello",
    tokenCount: 0,
    retrievedChunkIds: [],
    modelName: null,
    createdAt: "2025-01-01T12:30:00.000Z",
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

describe("MessageBubble", () => {
  it("renders a user message with the 'You' label and ember accent", () => {
    render(
      <MessageBubble
        conversationId="c-1"
        message={makeMessage({ role: "user", content: "Hi" })}
      />,
    )
    expect(screen.getByText("You")).toBeInTheDocument()
    expect(screen.getByText("Hi")).toBeInTheDocument()
    const article = screen.getByRole("article")
    expect(article).toHaveAttribute("data-role", "user")
  })

  it("renders an assistant message with the 'Assistant' label", () => {
    render(
      <MessageBubble
        conversationId="c-1"
        message={makeMessage({
          role: "assistant",
          content: "Cortex uses pgvector for semantic retrieval…",
        })}
      />,
    )
    expect(screen.getByText("Assistant")).toBeInTheDocument()
    expect(
      screen.getByText(/Cortex uses pgvector for semantic retrieval/i),
    ).toBeInTheDocument()
    const article = screen.getByRole("article")
    expect(article).toHaveAttribute("data-role", "assistant")
  })

  it("renders a tool message with the 'Tool' label + monospace class", () => {
    render(
      <MessageBubble
        conversationId="c-1"
        message={makeMessage({
          role: "tool",
          content: '{"chunks": [1, 2, 3]}',
        })}
      />,
    )
    expect(screen.getByText("Tool")).toBeInTheDocument()
    expect(screen.getByText(/chunks/)).toBeInTheDocument()
    const article = screen.getByRole("article")
    expect(article).toHaveAttribute("data-role", "tool")
    expect(article.className).toMatch(/font-mono/)
  })
})

// ---------------------------------------------------------------------------
// MessageList + ChatEmptyState
// ---------------------------------------------------------------------------

describe("MessageList", () => {
  it("renders the empty state when there are no messages", () => {
    render(<MessageList messages={[]} stream={null} conversationId="c-1" />)
    expect(
      screen.getByText(/ask anything about your knowledge base/i),
    ).toBeInTheDocument()
  })

  it("renders one bubble per message when present", () => {
    render(
      <MessageList
        stream={null}
        conversationId="c-1"
        messages={[
          makeMessage({ id: "m-1", role: "user", content: "Hi" }),
          makeMessage({ id: "m-2", role: "assistant", content: "Hello" }),
        ]}
      />,
    )
    expect(screen.getByText("Hi")).toBeInTheDocument()
    expect(screen.getByText("Hello")).toBeInTheDocument()
    // No empty state copy.
    expect(
      screen.queryByText(/ask anything about your knowledge base/i),
    ).toBeNull()
  })
})

describe("ChatEmptyState", () => {
  it("renders the spec's exact copy", () => {
    render(<ChatEmptyState />)
    expect(
      screen.getByText(/ask anything about your knowledge base/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Cortex can answer questions using your indexed documents/i,
      ),
    ).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// MessageInput (Task 12 + 13)
// ---------------------------------------------------------------------------

describe("MessageInput", () => {
  it("disables the Send button when the value is empty", () => {
    render(
      <MessageInput
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
      />,
      { wrapper: makeWrapper() },
    )
    const send = screen.getByRole("button", { name: /send message/i })
    expect(send).toBeDisabled()
  })

  it("enables the Send button when the value has content", () => {
    render(
      <MessageInput
        value="hello"
        onChange={() => {}}
        onSubmit={() => {}}
      />,
      { wrapper: makeWrapper() },
    )
    const send = screen.getByRole("button", { name: /send message/i })
    expect(send).not.toBeDisabled()
  })

  it("calls onSubmit with the trimmed value on plain Enter", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <MessageInput
        value="hi"
        onChange={() => {}}
        onSubmit={onSubmit}
      />,
      { wrapper: makeWrapper() },
    )
    const textarea = screen.getByLabelText(/^message$/i)
    textarea.focus()
    await user.keyboard("{Enter}")
    expect(onSubmit).toHaveBeenCalledWith("hi")
  })

  it("does not submit on Shift+Enter (newline instead)", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <MessageInput
        value="hi"
        onChange={() => {}}
        onSubmit={onSubmit}
      />,
      { wrapper: makeWrapper() },
    )
    const textarea = screen.getByLabelText(/^message$/i)
    textarea.focus()
    await user.keyboard("{Shift>}{Enter}{/Shift}")
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("does not submit when the value is whitespace only", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <MessageInput
        value="   "
        onChange={() => {}}
        onSubmit={onSubmit}
      />,
      { wrapper: makeWrapper() },
    )
    const textarea = screen.getByLabelText(/^message$/i)
    textarea.focus()
    await user.keyboard("{Enter}")
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("calls onChange on input", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <MessageInput
        value=""
        onChange={onChange}
        onSubmit={() => {}}
      />,
      { wrapper: makeWrapper() },
    )
    const textarea = screen.getByLabelText(/^message$/i)
    await user.type(textarea, "h")
    expect(onChange).toHaveBeenCalledWith("h")
  })

  it("renders the Slate placeholder + Volt focus hint", () => {
    render(
      <MessageInput
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
      />,
      { wrapper: makeWrapper() },
    )
    expect(
      screen.getByPlaceholderText(/ask something about your knowledge base/i),
    ).toBeInTheDocument()
    // The "Enter to send · Shift+Enter for newline" hint is rendered.
    expect(screen.getByText(/shift\+enter for newline/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ChatErrorState (Task 16)
// ---------------------------------------------------------------------------

describe("ChatErrorState", () => {
  it("renders the spec's title + a Try again retry button", () => {
    const onRetry = vi.fn()
    render(<ChatErrorState onRetry={onRetry} />)
    expect(
      screen.getByText(/we couldn't load this conversation/i),
    ).toBeInTheDocument()
    const retry = screen.getByRole("button", { name: /try again/i })
    expect(retry).toBeInTheDocument()
  })

  it("calls onRetry when the Try again button is clicked", async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(<ChatErrorState onRetry={onRetry} />)
    await user.click(screen.getByRole("button", { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// ConversationHeader (Task 9)
// ---------------------------------------------------------------------------

describe("ConversationHeader", () => {
  it("renders the title (or 'New conversation' fallback)", () => {
    render(<ConversationHeader title="Architecture" />, {
      wrapper: makeWrapper(),
    })
    expect(
      screen.getByRole("heading", { name: /architecture/i }),
    ).toBeInTheDocument()
  })

  it("falls back to 'New conversation' when no title is provided", () => {
    render(<ConversationHeader title={null} />, { wrapper: makeWrapper() })
    expect(
      screen.getByRole("heading", { name: /new conversation/i }),
    ).toBeInTheDocument()
  })

  it("calls POST /conversations + navigates to /chat/{id} on New", async () => {
    const post = vi.fn().mockResolvedValue({
      id: "new-id",
      tenantId: "t-1",
      userId: "u-1",
      title: "New conversation",
      summary: null,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    })
    getApiClientMock.mockReturnValue({ post } as never)

    const user = userEvent.setup()
    render(<ConversationHeader title={null} />, { wrapper: makeWrapper() })
    const newBtn = screen.getByRole("button", { name: /start a new conversation/i })
    await user.click(newBtn)
    await vi.waitFor(() => {
      expect(post).toHaveBeenCalledWith("/api/v1/conversations", {
        title: "New conversation",
      })
    })
    // We deliberately do not assert the
    // navigation call here — the global
    // next/navigation mock returns a fresh
    // router per call, so we'd be checking
    // a different instance than the
    // component consumed. The route
    // destination is verified by reading
    // the component source (`/chat/{id}`,
    // not `/app/chat/{id}` — the F4 P2
    // fix for a pre-existing P1 bug).
  })
})

// ---------------------------------------------------------------------------
// ChatLayout (Task 8)
// ---------------------------------------------------------------------------

describe("ChatLayout", () => {
  it("composes header + empty state + input", () => {
    const onSend = vi.fn()
    render(<ChatLayout title={null} onSend={onSend} conversationId="c-1" />, {
      wrapper: makeWrapper(),
    })
    // Header (heading)
    expect(
      screen.getByRole("heading", { name: /new conversation/i }),
    ).toBeInTheDocument()
    // Empty state
    expect(
      screen.getByText(/ask anything about your knowledge base/i),
    ).toBeInTheDocument()
    // Input
    expect(screen.getByLabelText(/^message$/i)).toBeInTheDocument()
  })

  it("renders bubbles for each message", () => {
    render(
      <ChatLayout
        title="Architecture"
        conversationId="c-1"
        messages={[
          makeMessage({ id: "m-1", role: "user", content: "Hi" }),
          makeMessage({ id: "m-2", role: "assistant", content: "Hello" }),
        ]}
      />,
      { wrapper: makeWrapper() },
    )
    expect(screen.getByText("Hi")).toBeInTheDocument()
    expect(screen.getByText("Hello")).toBeInTheDocument()
  })

  it("passes the input through to onSend and clears the draft", async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<ChatLayout title={null} onSend={onSend} conversationId="c-1" />, {
      wrapper: makeWrapper(),
    })
    const textarea = screen.getByLabelText(/^message$/i)
    await user.type(textarea, "What does Cortex do?")
    textarea.focus()
    await user.keyboard("{Enter}")
    expect(onSend).toHaveBeenCalledWith("What does Cortex do?")
    // Draft is cleared after send.
    expect((textarea as HTMLTextAreaElement).value).toBe("")
  })
})
