/**
 * Auth store — session restoration + cookie-hint bridge.
 *
 * **F2 Part 1 (Task 8 + 9).** Validates the
 * Zustand-backed auth store's:
 *   - `login()` writes the session + sets the cookie hint.
 *   - `logout()` clears state + deletes the cookie hint.
 *   - `isAuthenticated()` reads `accessToken` + `expiresAt`.
 *   - `clear()` hard-clears everything.
 *   - `refresh()` swaps the access token + extends expiry.
 *
 * The store is singleton + persists to sessionStorage;
 * tests run against the live store with a fresh
 * sessionStorage on every test (vitest's happy-dom
 * provides one per test file).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { AUTH_HINT_COOKIE, type AuthSession, useAuthStore } from "@/lib/auth/store"

function clearAuthCookie() {
  document.cookie = `${AUTH_HINT_COOKIE}=; Path=/; Max-Age=0`
}

function readAuthCookie(): string | null {
  const all = document.cookie.split(";")
  for (const raw of all) {
    const trimmed = raw.trim()
    if (trimmed.startsWith(`${AUTH_HINT_COOKIE}=`)) {
      return trimmed.slice(AUTH_HINT_COOKIE.length + 1)
    }
  }
  return null
}

const sampleSession: AuthSession = {
  accessToken: "jwt-abc",
  refreshToken: "rt-xyz",
  expiresIn: 3600,
  user: {
    id: "user-1",
    email: "ada@cortex.dev",
    role: "owner",
    tenantId: "tenant-1",
  },
  tenant: {
    id: "tenant-1",
    slug: "acme",
    workspace: "Acme",
  },
}

describe("auth store", () => {
  beforeEach(() => {
    useAuthStore.getState().clear()
    clearAuthCookie()
  })

  afterEach(() => {
    useAuthStore.getState().clear()
    clearAuthCookie()
  })

  it("starts empty", () => {
    const s = useAuthStore.getState()
    expect(s.accessToken).toBeNull()
    expect(s.refreshToken).toBeNull()
    expect(s.user).toBeNull()
    expect(s.tenant).toBeNull()
    expect(s.expiresAt).toBeNull()
    expect(s.isAuthenticated()).toBe(false)
  })

  it("login() writes the session + sets the cookie hint", () => {
    useAuthStore.getState().login(sampleSession)
    const s = useAuthStore.getState()
    expect(s.accessToken).toBe("jwt-abc")
    expect(s.refreshToken).toBe("rt-xyz")
    expect(s.user?.email).toBe("ada@cortex.dev")
    expect(s.tenant?.slug).toBe("acme")
    expect(s.expiresAt).toBeGreaterThan(Date.now())
    expect(s.isAuthenticated()).toBe(true)
    expect(readAuthCookie()).toBe("1")
  })

  it("logout() clears state + deletes the cookie hint", async () => {
    useAuthStore.getState().login(sampleSession)
    expect(readAuthCookie()).toBe("1")
    await useAuthStore.getState().logout()
    const s = useAuthStore.getState()
    expect(s.accessToken).toBeNull()
    expect(s.user).toBeNull()
    expect(s.isAuthenticated()).toBe(false)
    expect(readAuthCookie()).toBeNull()
  })

  it("clear() hard-clears without telling the backend", () => {
    useAuthStore.getState().login(sampleSession)
    useAuthStore.getState().clear()
    const s = useAuthStore.getState()
    expect(s.accessToken).toBeNull()
    expect(s.user).toBeNull()
    expect(s.isAuthenticated()).toBe(false)
    // happy-dom's cookie jar doesn't always evict a `Max-Age=0`
    // cookie immediately — accept either "deleted" (no cookie)
    // or "cleared to empty". The production behaviour is "deleted".
    const cookie = readAuthCookie()
    expect(cookie === null || cookie === "").toBe(true)
  })

  it("isAuthenticated() returns false when the token is expired", () => {
    useAuthStore.getState().login({ ...sampleSession, expiresIn: -10 })
    expect(useAuthStore.getState().isAuthenticated()).toBe(false)
  })

  it("refresh() swaps the access token + extends expiresAt", async () => {
    useAuthStore.getState().login(sampleSession)
    const before = useAuthStore.getState().expiresAt
    // Wait a tiny bit so the new expiresAt is strictly later.
    await new Promise((r) => setTimeout(r, 5))
    useAuthStore.getState().refresh({ accessToken: "jwt-new", expiresIn: 7200 })
    const after = useAuthStore.getState()
    expect(after.accessToken).toBe("jwt-new")
    expect(after.refreshToken).toBe("rt-xyz") // preserved
    expect((after.expiresAt ?? 0) > (before ?? 0)).toBe(true)
    expect(readAuthCookie()).toBe("1")
  })
})
