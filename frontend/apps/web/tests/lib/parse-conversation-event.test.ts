/**
 * parseConversationEvent — F4 Part 2 (Task 18).
 *
 * Mirrors the existing F3 Part 4 parser test
 * (`tests/lib/parse-event.test.ts`). The
 * parser is pure: same input → same output,
 * no globals. We test:
 *
 *   - Each of the 5 event types parses to
 *     the correct shape.
 *   - Field-level validation rejects
 *     incomplete payloads.
 *   - Malformed JSON returns `null`.
 *   - Unknown event types return `null`
 *     (forward-compat: future server events
 *     don't crash old clients).
 */

import { describe, expect, it } from "vitest"

import { parseConversationEvent } from "@/lib/websocket/parseConversationEvent"

describe("parseConversationEvent", () => {
  it("parses message_start", () => {
    const event = parseConversationEvent(
      JSON.stringify({ type: "message_start", message_id: "m-1" }),
    )
    expect(event).toEqual({ type: "message_start", messageId: "m-1" })
  })

  it("parses token with a string content", () => {
    const event = parseConversationEvent(
      JSON.stringify({ type: "token", content: "Hello" }),
    )
    expect(event).toEqual({ type: "token", content: "Hello" })
  })

  it("parses citation with all fields", () => {
    const event = parseConversationEvent(
      JSON.stringify({
        type: "citation",
        citation: {
          document_id: "d-1",
          chunk_id: "c-1",
          document_title: "Cortex Spec",
          chunk_index: 3,
          score: 0.91,
          excerpt: "excerpt text",
        },
      }),
    )
    expect(event).toEqual({
      type: "citation",
      citation: {
        documentId: "d-1",
        chunkId: "c-1",
        documentTitle: "Cortex Spec",
        chunkIndex: 3,
        score: 0.91,
        excerpt: "excerpt text",
      },
    })
  })

  it("parses citation with score defaulting to 0", () => {
    const event = parseConversationEvent(
      JSON.stringify({
        type: "citation",
        citation: {
          document_id: "d-1",
          chunk_id: "c-1",
          document_title: "Doc",
          chunk_index: 0,
        },
      }),
    )
    expect(event).toMatchObject({
      type: "citation",
      citation: { score: 0 },
    })
  })

  it("parses message_complete", () => {
    const event = parseConversationEvent(
      JSON.stringify({ type: "message_complete", message_id: "m-1" }),
    )
    expect(event).toEqual({ type: "message_complete", messageId: "m-1" })
  })

  it("parses error with message", () => {
    const event = parseConversationEvent(
      JSON.stringify({
        type: "error",
        code: "GENERATION_FAILED",
        message: "LLM down",
      }),
    )
    expect(event).toEqual({
      type: "error",
      code: "GENERATION_FAILED",
      message: "LLM down",
    })
  })

  it("parses error without message", () => {
    const event = parseConversationEvent(
      JSON.stringify({ type: "error", code: "BAD_REQUEST" }),
    )
    expect(event).toEqual({ type: "error", code: "BAD_REQUEST" })
  })

  it("returns null on malformed JSON", () => {
    expect(parseConversationEvent("not json")).toBeNull()
  })

  it("returns null on unknown event type", () => {
    expect(
      parseConversationEvent(JSON.stringify({ type: "wat" })),
    ).toBeNull()
  })

  it("returns null on missing discriminator", () => {
    expect(parseConversationEvent(JSON.stringify({}))).toBeNull()
  })

  it("rejects message_start with empty message_id", () => {
    expect(
      parseConversationEvent(
        JSON.stringify({ type: "message_start", message_id: "" }),
      ),
    ).toBeNull()
  })

  it("rejects token with non-string content", () => {
    expect(
      parseConversationEvent(
        JSON.stringify({ type: "token", content: 42 }),
      ),
    ).toBeNull()
  })

  it("rejects citation missing required fields", () => {
    expect(
      parseConversationEvent(
        JSON.stringify({
          type: "citation",
          citation: { document_id: "d-1" },
        }),
      ),
    ).toBeNull()
  })

  it("rejects error missing code", () => {
    expect(
      parseConversationEvent(
        JSON.stringify({ type: "error", message: "nope" }),
      ),
    ).toBeNull()
  })
})
