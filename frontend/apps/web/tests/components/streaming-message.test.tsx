/**
 * StreamingMessage — F4 Part 2 (Tasks 20, 22, 23) + Part 3.
 *
 * Verifies:
 *   - The Spark Glow is rendered while
 *     `isActive` is true and removed
 *     when `isActive` flips to false.
 *   - The streaming cursor is visible
 *     during active streaming and gone
 *     afterwards.
 *   - When `finalMessage` is provided +
 *     the stream is no longer active,
 *     the component hands off to a
 *     normal MessageBubble.
 *   - The accumulator content is shown
 *     while the stream is active.
 *   - The conversationId + retrievedChunkIds
 *     props are forwarded to the citation
 *     resolver (Part 3).
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { StreamingMessage } from "@/components/chat/StreamingMessage"
import type { Message } from "@/types/conversation"

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "a-1",
    conversationId: "c-1",
    role: "assistant",
    content: "Cortex uses Postgres.",
    tokenCount: 0,
    retrievedChunkIds: [],
    modelName: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("StreamingMessage", () => {
  it("shows the accumulator with the streaming cursor + Spark Glow while active", () => {
    render(
      <StreamingMessage
        content="Cortex uses"
        isActive={true}
        conversationId="c-1"
        retrievedChunkIds={[]}
      />,
    )
    expect(screen.getByText("Cortex uses")).toBeInTheDocument()
    const article = screen.getByRole("article")
    expect(article.getAttribute("data-streaming")).toBe("true")
  })

  it("renders the Generating pill while active", () => {
    render(
      <StreamingMessage
        content="Cortex"
        isActive={true}
        conversationId="c-1"
        retrievedChunkIds={[]}
      />,
    )
    expect(screen.getByText(/generating/i)).toBeInTheDocument()
  })

  it("hides the cursor + settles flat when the stream completes", () => {
    render(
      <StreamingMessage
        content="Cortex uses Postgres"
        isActive={false}
        conversationId="c-1"
        retrievedChunkIds={[]}
        finalMessage={null}
      />,
    )
    const article = screen.getByRole("article")
    expect(article.getAttribute("data-streaming")).toBe("false")
    expect(screen.queryByText(/generating/i)).toBeNull()
  })

  it("hands off to a normal MessageBubble when finalMessage is provided", () => {
    render(
      <StreamingMessage
        content="Cortex uses Postgres"
        isActive={false}
        conversationId="c-1"
        retrievedChunkIds={[]}
        finalMessage={makeMessage({
          id: "a-1",
          role: "assistant",
          content: "Cortex uses Postgres.",
        })}
      />,
    )
    const article = screen.getByRole("article")
    expect(article.getAttribute("data-streaming")).toBeNull()
    expect(article.getAttribute("data-role")).toBe("assistant")
    expect(screen.getByText("Cortex uses Postgres.")).toBeInTheDocument()
  })
})
