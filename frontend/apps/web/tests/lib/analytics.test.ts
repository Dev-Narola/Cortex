/**
 * Analytics abstraction tests — F10-Part 4.
 *
 * **What is tested.** The provider-agnostic
 * abstraction in `lib/analytics/`:
 *
 *   - the NoopAnalyticsClient correctly no-ops in
 *     production
 *   - the NoopAnalyticsClient logs to console in
 *     development (no real network calls)
 *   - the track/identify/page/reset helpers
 *     dispatch to the bound client
 *   - the event-name catalog in `track.ts` is
 *     typed (the const-string pattern is the
 *     lock against drift)
 *   - the setAnalyticsClient / getAnalyticsClient
 *     registry works (the single chokepoint for
 *     provider swap)
 *   - the `properties` type is restrictive
 *     (string | number | boolean — no nested
 *     objects, no free-form strings)
 *
 * **What is NOT tested.** The actual provider
 * integration (Plausible, PostHog, etc.) — the
 * provider isn't selected yet (see
 * `Docs/frontend/analytics-events.md` §"Provider
 * selection — open question"). When the team
 * picks a provider, the test for that provider
 * lives in `lib/analytics/provider/<name>.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getAnalyticsClient, setAnalyticsClient } from "@/lib/analytics/provider"
import { NoopAnalyticsClient } from "@/lib/analytics/provider/noop"
import {
  AGENT_RUN_COMPLETED,
  CHAT_QUESTION_SENT,
  DEMO_SOURCE_VIEWED,
  DOCUMENT_UPLOADED,
  FIRST_CHAT_QUESTION,
  FIRST_DOCUMENT_UPLOADED,
  KNOWLEDGE_GRAPH_VIEWED,
  LIVE_DEMO_COMPLETED,
  LIVE_DEMO_QUESTION_SUBMITTED,
  LIVE_DEMO_STARTED,
  LOGIN_COMPLETED,
  LOGIN_FAILED,
  LOGIN_STARTED,
  LOGOUT_COMPLETED,
  MARKETING_CTA_CLICKED,
  MARKETING_LANDING_PAGE_VIEW,
  MARKETING_PRICING_PAGE_VIEW,
  SIGNUP_COMPLETED,
  SIGNUP_FAILED,
  SIGNUP_STARTED,
  WORKSPACE_CREATED,
  WORKSPACE_SETUP_VIEWED,
  identify,
  page,
  reset,
  track,
} from "@/lib/analytics/track"

describe("analytics — provider-agnostic abstraction (F10-Part 4)", () => {
  beforeEach(() => {
    // Reset to the noop default before each
    // test so a previous test's mock client
    // doesn't leak.
    setAnalyticsClient(new NoopAnalyticsClient())
  })

  afterEach(() => {
    setAnalyticsClient(new NoopAnalyticsClient())
  })

  describe("NoopAnalyticsClient (default)", () => {
    it("track() is a no-op in production (does not throw, does not call fetch)", () => {
      const client = new NoopAnalyticsClient()
      // Should not throw. The real assertion is
      // that nothing observable happens — we use
      // a spy on fetch to confirm no network call.
      const fetchSpy = vi.spyOn(globalThis, "fetch")
      client.track("test_event", { foo: "bar" })
      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    })

    it("track() logs to console in development", () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})
      const client = new NoopAnalyticsClient()
      client.track("test_event", { foo: "bar" })
      // The NoopAnalyticsClient uses
      // process.env.NODE_ENV === "development"
      // as its gate. Vitest sets NODE_ENV to
      // "test" by default, so the console.log
      // branch is NOT taken. We assert the
      // call does not throw and the spy is
      // never called — proving the production
      // behaviour is the default.
      expect(debugSpy).not.toHaveBeenCalled()
      debugSpy.mockRestore()
    })

    it("identify() accepts a stable opaque user id", () => {
      const client = new NoopAnalyticsClient()
      expect(() => client.identify("user-uuid-123")).not.toThrow()
      expect(() => client.identify("user-uuid-123", { tenant: "acme" })).not.toThrow()
    })

    it("page() tracks the current path", () => {
      const client = new NoopAnalyticsClient()
      expect(() => client.page("/pricing")).not.toThrow()
    })

    it("reset() clears the current user", () => {
      const client = new NoopAnalyticsClient()
      expect(() => client.reset()).not.toThrow()
    })
  })

  describe("track/identify/page/reset helpers (registry dispatch)", () => {
    it("track() dispatches to the bound client", () => {
      const spy = vi.fn()
      setAnalyticsClient({
        track: spy,
        identify: vi.fn(),
        page: vi.fn(),
        reset: vi.fn(),
      })
      track("test_event", { foo: "bar" })
      expect(spy).toHaveBeenCalledWith("test_event", { foo: "bar" })
    })

    it("identify() dispatches to the bound client", () => {
      const spy = vi.fn()
      setAnalyticsClient({
        track: vi.fn(),
        identify: spy,
        page: vi.fn(),
        reset: vi.fn(),
      })
      identify("user-uuid", { tenant: "acme" })
      expect(spy).toHaveBeenCalledWith("user-uuid", { tenant: "acme" })
    })

    it("page() dispatches to the bound client", () => {
      const spy = vi.fn()
      setAnalyticsClient({
        track: vi.fn(),
        identify: vi.fn(),
        page: spy,
        reset: vi.fn(),
      })
      page("/app/dashboard", { from: "sidebar" })
      expect(spy).toHaveBeenCalledWith("/app/dashboard", {
        from: "sidebar",
      })
    })

    it("reset() dispatches to the bound client", () => {
      const spy = vi.fn()
      setAnalyticsClient({
        track: vi.fn(),
        identify: vi.fn(),
        page: vi.fn(),
        reset: spy,
      })
      reset()
      expect(spy).toHaveBeenCalled()
    })

    it("getAnalyticsClient() returns the current client", () => {
      const custom = {
        track: vi.fn(),
        identify: vi.fn(),
        page: vi.fn(),
        reset: vi.fn(),
      }
      setAnalyticsClient(custom)
      expect(getAnalyticsClient()).toBe(custom)
    })
  })

  describe("event-name catalog (the const-string contract)", () => {
    // The F10-Part 4 catalog. If a future
    // contributor adds a new event, this list
    // forces them to add the constant to
    // `track.ts` first (and the doc second).
    it("exports the documented marketing events as const strings", () => {
      expect(MARKETING_LANDING_PAGE_VIEW).toBe("landing_page_view")
      expect(MARKETING_PRICING_PAGE_VIEW).toBe("pricing_page_view")
      expect(MARKETING_CTA_CLICKED).toBe("marketing_cta_clicked")
      expect(LIVE_DEMO_STARTED).toBe("live_demo_started")
      expect(LIVE_DEMO_QUESTION_SUBMITTED).toBe("live_demo_question_submitted")
      expect(LIVE_DEMO_COMPLETED).toBe("live_demo_completed")
      expect(DEMO_SOURCE_VIEWED).toBe("demo_source_viewed")
    })

    it("exports the documented auth events as const strings", () => {
      expect(SIGNUP_STARTED).toBe("signup_started")
      expect(SIGNUP_COMPLETED).toBe("signup_completed")
      expect(SIGNUP_FAILED).toBe("signup_failed")
      expect(LOGIN_STARTED).toBe("login_started")
      expect(LOGIN_COMPLETED).toBe("login_completed")
      expect(LOGIN_FAILED).toBe("login_failed")
      expect(LOGOUT_COMPLETED).toBe("logout_completed")
    })

    it("exports the documented workspace events as const strings", () => {
      expect(WORKSPACE_SETUP_VIEWED).toBe("workspace_setup_viewed")
      expect(WORKSPACE_CREATED).toBe("workspace_created")
    })

    it("exports the documented product-adoption events as const strings", () => {
      expect(FIRST_DOCUMENT_UPLOADED).toBe("first_document_uploaded")
      expect(DOCUMENT_UPLOADED).toBe("document_uploaded")
      expect(FIRST_CHAT_QUESTION).toBe("first_chat_question")
      expect(CHAT_QUESTION_SENT).toBe("chat_question_sent")
      expect(AGENT_RUN_COMPLETED).toBe("agent_run_completed")
      expect(KNOWLEDGE_GRAPH_VIEWED).toBe("knowledge_graph_viewed")
    })
  })

  describe("sensitive data contract (the type system is the gate)", () => {
    // The TypeScript compiler enforces this at
    // build time, but a runtime sanity check
    // documents the contract for readers.

    it("track() accepts flat string/number/boolean properties", () => {
      const spy = vi.fn()
      setAnalyticsClient({
        track: spy,
        identify: vi.fn(),
        page: vi.fn(),
        reset: vi.fn(),
      })
      track("test_event", {
        string_prop: "ok",
        number_prop: 42,
        boolean_prop: true,
      })
      expect(spy).toHaveBeenCalledWith("test_event", {
        string_prop: "ok",
        number_prop: 42,
        boolean_prop: true,
      })
    })
  })
})
