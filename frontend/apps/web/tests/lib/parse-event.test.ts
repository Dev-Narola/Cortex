/**
 * WebSocket event parser — F3 Part 4 (Task 35).
 *
 * The parser is the single boundary between
 * "raw bytes from the network" and "typed
 * events for the rest of the app". It must
 * reject malformed input without throwing.
 */

import { describe, expect, it } from "vitest"

import { parseIngestionEvent } from "@/lib/websocket/parseEvent"

describe("parseIngestionEvent", () => {
  it("parses a well-formed ingestion.status event", () => {
    const raw = JSON.stringify({
      type: "ingestion.status",
      document_id: "abc-123",
      status: "parsing",
      timestamp: 1234567890,
    })
    const event = parseIngestionEvent(raw)
    expect(event).toEqual({
      type: "ingestion.status",
      document_id: "abc-123",
      status: "parsing",
      timestamp: 1234567890,
    })
  })

  it("accepts an event without a timestamp", () => {
    const event = parseIngestionEvent(
      JSON.stringify({
        type: "ingestion.status",
        document_id: "x",
        status: "indexed",
      }),
    )
    expect(event).toEqual({
      type: "ingestion.status",
      document_id: "x",
      status: "indexed",
      timestamp: undefined,
    })
  })

  it("parses an ingestion.detail event", () => {
    const event = parseIngestionEvent(
      JSON.stringify({
        type: "ingestion.detail",
        document_id: "x",
        detail: { chunk_count: 42, embedding_count: 42 },
      }),
    )
    expect(event).toEqual({
      type: "ingestion.detail",
      document_id: "x",
      detail: { chunk_count: 42, embedding_count: 42 },
    })
  })

  it("rejects malformed JSON", () => {
    expect(parseIngestionEvent("not json {")).toBeNull()
    expect(parseIngestionEvent("")).toBeNull()
  })

  it("rejects an unknown event type", () => {
    expect(
      parseIngestionEvent(
        JSON.stringify({
          type: "wat",
          document_id: "x",
          status: "indexed",
        }),
      ),
    ).toBeNull()
  })

  it("rejects an unknown status", () => {
    expect(
      parseIngestionEvent(
        JSON.stringify({
          type: "ingestion.status",
          document_id: "x",
          status: "definitely-not-a-status",
        }),
      ),
    ).toBeNull()
  })

  it("rejects a missing document_id", () => {
    expect(
      parseIngestionEvent(
        JSON.stringify({
          type: "ingestion.status",
          status: "indexed",
        }),
      ),
    ).toBeNull()
  })

  it("rejects an empty document_id", () => {
    expect(
      parseIngestionEvent(
        JSON.stringify({
          type: "ingestion.status",
          document_id: "",
          status: "indexed",
        }),
      ),
    ).toBeNull()
  })

  it("rejects non-object payloads", () => {
    expect(parseIngestionEvent("null")).toBeNull()
    expect(parseIngestionEvent("42")).toBeNull()
    expect(parseIngestionEvent('"hi"')).toBeNull()
  })
})
