/**
 * CitationPanel — F4 Part 3 (Tasks 44, 45, 46, 47, 48, 49, 50, 51, 52, 74, 75).
 *
 * The panel's contract:
 *   - Closed by default (no selection).
 *   - Opens when a citation is selected
 *     via the store.
 *   - Renders the document title +
 *     chunk index + excerpt when the
 *     citation is ready.
 *   - Renders "Source unavailable" when
 *     the citation's chunk is not in
 *     the stream (Task 58).
 *   - Closes via the X button OR Escape.
 *   - "View full document" opens the
 *     F3 document drawer.
 *   - Switching to a different citation
 *     updates the panel without
 *     closing it (Task 75).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ToastProvider, ToastViewport } from "@cortex/ui"

import { CitationPanel } from "@/components/chat/citations/CitationPanel"
import {
  useCitationPanelStore,
} from "@/hooks/chat/citationPanelStore"
import { useConversationStreamStore } from "@/hooks/chat/conversationStreamStore"
import {
  useDocumentSelectionStore,
} from "@/components/documents/DocumentSelectionStore"

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        {children}
        <ToastViewport />
      </ToastProvider>
    </QueryClientProvider>
  )
}

function seedCitation(input: {
  conversationId: string
  messageId: string
  chunkId: string
  documentId?: string
  documentTitle?: string
  chunkIndex?: number
  excerpt?: string | null
}) {
  const {
    conversationId,
    messageId,
    chunkId,
    documentId = "doc-1",
    documentTitle = "Doc 1",
    chunkIndex = 0,
    excerpt = "Sample excerpt text",
  } = input
  useConversationStreamStore.getState().beginTurn({
    conversationId,
    userMessageId: "u-1",
    content: "hi",
  })
  useConversationStreamStore.getState().applyEvent(conversationId, {
    type: "message_start",
    messageId,
  })
  useConversationStreamStore.getState().applyEvent(conversationId, {
    type: "citation",
    citation: {
      documentId,
      chunkId,
      documentTitle,
      chunkIndex,
      score: 0.91,
      excerpt: excerpt ?? undefined,
    },
  })
  useConversationStreamStore.getState().applyEvent(conversationId, {
    type: "message_complete",
    messageId,
  })
}

beforeEach(() => {
  useCitationPanelStore.getState().reset()
  useConversationStreamStore.getState().resetAll()
  useDocumentSelectionStore.getState().reset()
})

afterEach(() => {
  useCitationPanelStore.getState().reset()
  useConversationStreamStore.getState().resetAll()
  useDocumentSelectionStore.getState().reset()
})

describe("CitationPanel (Task 44)", () => {
  it("renders nothing visible when closed (no selection)", () => {
    render(<CitationPanel conversationId="c-1" />, { wrapper: makeWrapper() })
    // No panel content; the source-header
    // and excerpt headings only appear
    // when there's a real selection.
    expect(screen.queryByText(/source/i)).toBeNull()
  })

  it("opens the panel + renders the document title + chunk + excerpt", () => {
    seedCitation({
      conversationId: "c-1",
      messageId: "a-1",
      chunkId: "chunk-1",
      documentTitle: "Cortex architecture document",
      chunkIndex: 2,
      excerpt: "Cortex uses PostgreSQL for vector storage.",
    })
    act(() => {
      useCitationPanelStore.getState().open("citation:chunk-1")
    })
    render(<CitationPanel conversationId="c-1" />, { wrapper: makeWrapper() })
    expect(
      screen.getByRole("heading", { name: /cortex architecture document/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/chunk 3/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Cortex uses PostgreSQL for vector storage\./),
    ).toBeInTheDocument()
  })

  it("renders the 'View full document' button", () => {
    seedCitation({
      conversationId: "c-1",
      messageId: "a-1",
      chunkId: "chunk-1",
    })
    act(() => {
      useCitationPanelStore.getState().open("citation:chunk-1")
    })
    render(<CitationPanel conversationId="c-1" />, { wrapper: makeWrapper() })
    expect(
      screen.getByRole("button", { name: /view full document/i }),
    ).toBeInTheDocument()
  })

  it("'View full document' closes the panel + opens the F3 document drawer", async () => {
    seedCitation({
      conversationId: "c-1",
      messageId: "a-1",
      chunkId: "chunk-1",
      documentId: "doc-1",
    })
    act(() => {
      useCitationPanelStore.getState().open("citation:chunk-1")
    })
    const user = userEvent.setup()
    render(<CitationPanel conversationId="c-1" />, { wrapper: makeWrapper() })
    const button = screen.getByRole("button", { name: /view full document/i })
    await user.click(button)
    // Panel is closed.
    expect(useCitationPanelStore.getState().isOpen).toBe(false)
    // F3 document drawer is opened.
    expect(useDocumentSelectionStore.getState().selectedId).toBe("doc-1")
    expect(useDocumentSelectionStore.getState().isOpen).toBe(true)
  })

  it("the X button closes the panel (Task 46)", async () => {
    seedCitation({
      conversationId: "c-1",
      messageId: "a-1",
      chunkId: "chunk-1",
    })
    act(() => {
      useCitationPanelStore.getState().open("citation:chunk-1")
    })
    const user = userEvent.setup()
    render(<CitationPanel conversationId="c-1" />, { wrapper: makeWrapper() })
    const closeBtn = screen.getByRole("button", { name: /close citation panel/i })
    await user.click(closeBtn)
    expect(useCitationPanelStore.getState().isOpen).toBe(false)
  })

  it("renders 'Source unavailable' when the stream did not include the chunk (Task 58)", () => {
    act(() => {
      useConversationStreamStore.getState().beginTurn({
        conversationId: "c-1",
        userMessageId: "u-1",
        content: "hi",
      })
    })
    act(() => {
      useCitationPanelStore.getState().open("citation:chunk-MISSING")
    })
    render(<CitationPanel conversationId="c-1" />, { wrapper: makeWrapper() })
    expect(screen.getByText(/source unavailable/i)).toBeInTheDocument()
  })

  it("switching to a different citation updates content without closing (Task 75)", () => {
    seedCitation({
      conversationId: "c-1",
      messageId: "a-1",
      chunkId: "chunk-1",
      documentTitle: "Doc One",
    })
    act(() => {
      useCitationPanelStore.getState().open("citation:chunk-1")
    })
    const { rerender } = render(<CitationPanel conversationId="c-1" />, {
      wrapper: makeWrapper(),
    })
    expect(
      screen.getByRole("heading", { name: /doc one/i }),
    ).toBeInTheDocument()
    // Add a second citation to the stream.
    act(() => {
      useConversationStreamStore.getState().applyEvent("c-1", {
        type: "citation",
        citation: {
          documentId: "doc-2",
          chunkId: "chunk-2",
          documentTitle: "Doc Two",
          chunkIndex: 1,
          score: 0.7,
          excerpt: "Second excerpt",
        },
      })
    })
    act(() => {
      useCitationPanelStore.getState().select("citation:chunk-2")
    })
    rerender(<CitationPanel conversationId="c-1" />)
    expect(
      screen.getByRole("heading", { name: /doc two/i }),
    ).toBeInTheDocument()
    // Panel is still open.
    expect(useCitationPanelStore.getState().isOpen).toBe(true)
  })
})
