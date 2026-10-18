import { describe, expect, it } from "vitest"

import { toConversation, toMessage } from "@/services/conversations/mappers"

describe("conversation mappers (backend snake_case → app camelCase)", () => {
  it("maps a conversation with embedded messages", () => {
    const c = toConversation({
      id: "c1",
      tenant_id: "t1",
      user_id: "u1",
      title: "How does hybrid search work?",
      summary: null,
      created_at: "2026-10-18T09:00:00Z",
      updated_at: "2026-10-18T10:00:00Z",
      messages: [
        {
          id: "m1",
          conversation_id: "c1",
          role: "assistant",
          content: "It fuses keyword and vector results [1].",
          token_count: 12,
          retrieved_chunk_ids: ["ch1"],
          model_name: "openai/gpt-oss-20b",
          agent_run_id: null,
          created_at: "2026-10-18T10:00:00Z",
        },
      ],
    })
    expect(c.updatedAt).toBe("2026-10-18T10:00:00Z")
    expect(c.tenantId).toBe("t1")
    expect(c.messages?.[0]?.retrievedChunkIds).toEqual(["ch1"])
    expect(c.messages?.[0]?.conversationId).toBe("c1")
    expect(c.messages?.[0]?.createdAt).toBe("2026-10-18T10:00:00Z")
  })

  it("defaults optional message fields so citation code never sees undefined", () => {
    const m = toMessage({
      id: "m2",
      conversation_id: "c1",
      role: "user",
      content: "hi",
      created_at: "2026-10-18T10:00:00Z",
    })
    expect(m.retrievedChunkIds).toEqual([])
    expect(m.tokenCount).toBe(0)
    expect(m.agentRunId).toBeNull()
  })

  it("numbers saved citations by their position in retrieved_chunk_ids", () => {
    const m = toMessage({
      id: "m3",
      conversation_id: "c1",
      role: "assistant",
      content: "A [1], C [3].",
      created_at: "2026-10-18T10:00:00Z",
      // The source cited as [2] was deleted, so the server omitted it.
      retrieved_chunk_ids: ["chA", "chB", "chC"],
      citations: [
        {
          document_id: "d1",
          chunk_id: "chA",
          document_title: "Guide",
          chunk_index: 0,
          excerpt: "a",
        },
        {
          document_id: "d3",
          chunk_id: "chC",
          document_title: "Notes",
          chunk_index: 2,
          excerpt: "c",
        },
      ],
    })
    expect(m.citations?.map((c) => [c.index, c.documentTitle, c.id])).toEqual([
      [1, "Guide", "citation:chA"],
      [3, "Notes", "citation:chC"],
    ])
  })

  it("omits messages for list rows", () => {
    const c = toConversation({
      id: "c2",
      tenant_id: "t",
      user_id: "u",
      title: "t",
      created_at: "x",
      updated_at: "y",
    })
    expect("messages" in c).toBe(false)
  })
})
