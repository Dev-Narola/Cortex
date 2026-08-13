/**
 * Auth services — successful + failed flows (F2 Part 1).
 *
 * **F2 Part 1 (Tasks 5, 6, 7).** Mocks the api-client
 * runtime and asserts that the login / register /
 * refresh / logout services forward the request +
 * unwrap the response correctly.
 *
 * **Why service-level tests (not the form).** The
 * form is composed of RHF + Zod + the service; the
 * form's job is "wire the inputs + handle loading",
 * which the spec covers with the schema tests + the
 * e2e suite. The service is the layer that talks to
 * the real backend; these tests verify the contract.
 */

import { ApiError } from "@cortex/api-client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/lib/auth/store"
import { login, logout, refresh, register } from "@/services/auth"

// Mock the api-client module so the services use a
// controllable in-memory client. We also expose a way
// to simulate server errors.
const postMock = vi.fn()
const getMock = vi.fn()

vi.mock("@/lib/auth/api-client", () => ({
  getApiClient: () => ({
    post: postMock,
    get: getMock,
  }),
  resetApiClient: vi.fn(),
}))

const loginResponse = {
  access_token: "jwt-1",
  refresh_token: "rt-1",
  token_type: "Bearer",
  expires_in: 3600,
  user: {
    id: "user-1",
    email: "ada@cortex.dev",
    role: "owner",
    tenant_id: "tenant-1",
  },
  tenant: {
    id: "tenant-1",
    slug: "acme",
    name: "Acme",
  },
}

const registerResponse = {
  access_token: "jwt-2",
  refresh_token: "rt-2",
  token_type: "Bearer",
  expires_in: 3600,
  user: {
    id: "user-2",
    email: "new@cortex.dev",
    role: "owner",
    tenant_id: "tenant-2",
  },
  tenant: {
    id: "tenant-2",
    slug: "new",
    name: "New",
  },
}

const refreshResponse = {
  access_token: "jwt-3",
  token_type: "Bearer",
  expires_in: 3600,
}

describe("auth services", () => {
  beforeEach(() => {
    postMock.mockReset()
    getMock.mockReset()
    // V11 hotfix 2 — the refresh service now
    // reads the refresh token from the auth
    // store. Seed it so the success test can
    // exercise the post body path.
    useAuthStore.setState({
      refreshToken: "rt-seed-1",
      accessToken: "jwt-seed-1",
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // Reset the auth store so cross-test
    // leakage doesn't surprise the next
    // describe block.
    useAuthStore.getState().clear()
  })

  describe("login", () => {
    it("returns the parsed response on success", async () => {
      postMock.mockResolvedValueOnce(loginResponse)
      const data = await login({
        tenant_slug: "acme",
        email: "ada@cortex.dev",
        password: "TestPass123",
      })
      expect(data).toEqual(loginResponse)
      expect(postMock).toHaveBeenCalledWith(
        "/api/v1/auth/login",
        expect.objectContaining({ tenant_slug: "acme" }),
      )
    })

    it("propagates a 401 as an ApiError", async () => {
      postMock.mockRejectedValueOnce(new ApiError(401, { message: "Invalid credentials" }))
      await expect(
        login({ tenant_slug: "acme", email: "ada@cortex.dev", password: "x" }),
      ).rejects.toBeInstanceOf(ApiError)
    })

    it("propagates a 5xx as an ApiError", async () => {
      postMock.mockRejectedValueOnce(new ApiError(500, { message: "boom" }))
      await expect(
        login({ tenant_slug: "acme", email: "ada@cortex.dev", password: "x" }),
      ).rejects.toBeInstanceOf(ApiError)
    })
  })

  describe("register", () => {
    it("returns the parsed response on success", async () => {
      postMock.mockResolvedValueOnce(registerResponse)
      const data = await register({
        name: "Ada",
        email: "new@cortex.dev",
        password: "TestPass123",
      })
      expect(data).toEqual(registerResponse)
    })

    it("auto-derives tenant_name + tenant_slug from name + email (V4 backend contract)", async () => {
      postMock.mockResolvedValueOnce(registerResponse)
      await register({
        name: "Ada Lovelace",
        email: "ada.lovelace@gmail.com",
        password: "TestPass123",
      })
      // The post body should include tenant_name=<name>
      // and tenant_slug=<email-local-part>-<6 hex chars>
      // so the V4 backend (which still requires these
      // fields) accepts the request.
      expect(postMock).toHaveBeenCalledTimes(1)
      const call = postMock.mock.calls[0]
      expect(call).toBeDefined()
      const body = call?.[1] as Record<string, unknown> | undefined
      expect(body).toMatchObject({
        name: "Ada Lovelace",
        email: "ada.lovelace@gmail.com",
        password: "TestPass123",
        tenant_name: "Ada Lovelace",
      })
      expect(body?.tenant_slug).toMatch(/^ada-lovelace-[a-f0-9]{6}$/)
    })

    it("respects caller-supplied tenant_name + tenant_slug (F2-aware backends)", async () => {
      postMock.mockResolvedValueOnce(registerResponse)
      await register({
        name: "Ada",
        email: "ada@cortex.dev",
        password: "TestPass123",
        tenant_name: "Acme",
        tenant_slug: "acme",
      })
      expect(postMock).toHaveBeenCalledTimes(1)
      const call = postMock.mock.calls[0]
      expect(call).toBeDefined()
      const body = call?.[1] as Record<string, unknown> | undefined
      expect(body?.tenant_name).toBe("Acme")
      expect(body?.tenant_slug).toBe("acme")
    })

    it("propagates a 409 (duplicate email) as an ApiError", async () => {
      postMock.mockRejectedValueOnce(new ApiError(409, { message: "Email already exists" }))
      await expect(
        register({ name: "Ada", email: "x@cortex.dev", password: "TestPass123" }),
      ).rejects.toBeInstanceOf(ApiError)
    })
  })

  describe("refresh", () => {
    it("returns the parsed response on success", async () => {
      postMock.mockResolvedValueOnce(refreshResponse)
      const data = await refresh()
      expect(data).toEqual(refreshResponse)
      // V11 hotfix 2 — the body MUST carry the
      // refresh token; the backend rejects an
      // empty body with 422 and the
      // ``useSessionRestore`` flow bounces the
      // user to /login on every hard refresh.
      expect(postMock).toHaveBeenCalledWith(
        "/api/v1/auth/refresh",
        { refresh_token: "rt-seed-1" },
      )
    })

    it("throws when no refresh token is in the store", async () => {
      useAuthStore.setState({ refreshToken: null })
      await expect(refresh()).rejects.toThrow("No refresh token available")
      // We must not have hit the network — the
      // guard short-circuits before ``post()``
      // would have been called.
      expect(postMock).not.toHaveBeenCalled()
    })
  })

  describe("logout", () => {
    it("swallows network errors (best-effort logout)", async () => {
      postMock.mockRejectedValueOnce(new Error("network down"))
      // Should NOT throw — the local logout must still proceed
      // even if the backend call fails.
      await expect(logout()).resolves.toBeUndefined()
    })

    it("resolves cleanly on success", async () => {
      postMock.mockResolvedValueOnce({})
      await expect(logout()).resolves.toBeUndefined()
    })
  })
})
