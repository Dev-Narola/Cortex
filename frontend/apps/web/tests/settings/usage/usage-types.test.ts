/**
 * eventTypeLabel — the friendly-label helper
 * used by the breakdown + history sections.
 *
 * F7 Part 4 (Task 12). The mapping lives in
 * a presentation layer — the backend's enum
 * is stable, the UI's label is whatever the
 * product team chooses.
 *
 * **Defensive default.** The backend may add
 * new event types in the future. The screen
 * must never crash on a new value — it
 * renders the raw enum instead. This test
 * pins that behaviour.
 */

import { describe, expect, it } from "vitest"

import { eventTypeLabel, EVENT_TYPES } from "@/services/usage"

describe("eventTypeLabel", () => {
  it("maps every known event type to its friendly label", () => {
    expect(eventTypeLabel(EVENT_TYPES.EMBEDDING)).toBe("Embeddings")
    expect(eventTypeLabel(EVENT_TYPES.COMPLETION)).toBe("Completions")
    expect(eventTypeLabel(EVENT_TYPES.RERANK)).toBe("Rerank")
    expect(eventTypeLabel(EVENT_TYPES.STORAGE)).toBe("Storage")
    expect(eventTypeLabel(EVENT_TYPES.REQUEST)).toBe("Requests")
  })

  it("falls back to the raw enum for unknown event types", () => {
    // The backend may add new event types
    // (the schema is `str`-based); the UI
    // must not crash.
    expect(eventTypeLabel("future_event_type")).toBe("future_event_type")
    expect(eventTypeLabel("not_a_real_event")).toBe("not_a_real_event")
    // Empty / weird inputs.
    expect(eventTypeLabel("")).toBe("")
  })
})

describe("EVENT_TYPES", () => {
  it("is a stable mapping between the UI's identifier and the backend's string", () => {
    // The UI uses these strings in the
    // service-layer test pins; the backend
    // uses the same strings in its
    // `EventType` enum (verified against
    // `Cortex/src/billing/infrastructure/repositories.py`).
    expect(EVENT_TYPES).toEqual({
      EMBEDDING: "embedding",
      COMPLETION: "completion",
      RERANK: "rerank",
      STORAGE: "storage",
      REQUEST: "request",
    })
  })
})
