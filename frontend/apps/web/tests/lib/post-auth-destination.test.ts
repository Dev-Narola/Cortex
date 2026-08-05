/**
 * postAuthDestination — routing helper.
 *
 * **F2 Part 2 (Task 20 + routing).** Decides the URL to
 * navigate to after a successful login / register. The
 * helper is the single source of truth for the
 * "where does the user go next?" decision.
 *
 * Covers:
 *   - With tenant → `/app/dashboard`.
 *   - Without tenant → `/workspace-setup`.
 *   - `?next=` override.
 *   - Open-redirect prevention (protocol-relative URLs,
 *     absolute URLs, off-origin URLs).
 *   - When `?next=` is unsafe, fall back to the
 *     tenant-based default.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { resolvePostAuthDestination } from "@/lib/auth/post-auth-destination"
import { useAuthStore } from "@/lib/auth/store"

describe("resolvePostAuthDestination", () => {
  beforeEach(() => {
    useAuthStore.getState().clear()
  })

  afterEach(() => {
    useAuthStore.getState().clear()
  })

  it("returns /workspace-setup when the user has no tenant", () => {
    expect(resolvePostAuthDestination(null)).toBe("/workspace-setup")
  })

  it("returns /app/dashboard when the user has a tenant", () => {
    useAuthStore.getState().setTenant({
      id: "tenant-1",
      slug: "acme",
      workspace: "Acme",
    })
    expect(resolvePostAuthDestination(null)).toBe("/app/dashboard")
  })

  it("respects a safe ?next= override (relative path)", () => {
    useAuthStore.getState().setTenant({ id: "t", slug: "a" })
    expect(resolvePostAuthDestination("/app/dashboard")).toBe("/app/dashboard")
    expect(resolvePostAuthDestination("/app/settings")).toBe("/app/settings")
  })

  it("rejects an absolute external URL (open-redirect)", () => {
    useAuthStore.getState().setTenant({ id: "t", slug: "a" })
    expect(resolvePostAuthDestination("https://evil.com")).toBe(
      "/app/dashboard",
    )
    expect(resolvePostAuthDestination("http://evil.com/x")).toBe(
      "/app/dashboard",
    )
  })

  it("rejects a protocol-relative URL (//evil.com)", () => {
    useAuthStore.getState().setTenant({ id: "t", slug: "a" })
    expect(resolvePostAuthDestination("//evil.com")).toBe("/app/dashboard")
    expect(resolvePostAuthDestination("//evil.com/x")).toBe("/app/dashboard")
  })

  it("rejects a next that doesn't start with `/`", () => {
    useAuthStore.getState().setTenant({ id: "t", slug: "a" })
    expect(resolvePostAuthDestination("app/dashboard")).toBe(
      "/app/dashboard",
    )
    expect(resolvePostAuthDestination("javascript:alert(1)")).toBe(
      "/app/dashboard",
    )
  })

  it("returns the tenant-based default when ?next= is null + user has no tenant", () => {
    expect(resolvePostAuthDestination(null)).toBe("/workspace-setup")
  })

  it("ignores the unsafe next and falls back to the tenant default (no-tenant)", () => {
    expect(resolvePostAuthDestination("https://evil.com")).toBe(
      "/workspace-setup",
    )
  })
})
