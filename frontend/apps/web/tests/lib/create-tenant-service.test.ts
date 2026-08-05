/**
 * createTenant service — service-level contract.
 *
 * **F2 Part 2 (Task 15).** Mocks the api-client and
 * verifies the service forwards the right URL + body
 * + unwraps the response.
 *
 * Covers:
 *   - Success path: parses the response.
 *   - 409: surfaces a slug-already-taken error.
 *   - 422: surfaces a validation error.
 *   - 401: surfaces an unauthorized error.
 *   - 5xx: surfaces a server error.
 *   - Network failure: surfaces a network error.
 */

import { ApiError } from "@cortex/api-client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createTenant } from "@/services/tenant"

const postMock = vi.fn()

vi.mock("@/lib/auth/api-client", () => ({
  getApiClient: () => ({ post: postMock }),
}))

const createdTenant = {
  id: "tenant-new",
  slug: "acme",
  name: "Acme Inc",
  organization: undefined,
}

describe("createTenant service", () => {
  beforeEach(() => {
    postMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("POSTs to /api/v1/tenants with the request body", async () => {
    postMock.mockResolvedValueOnce(createdTenant)
    const data = await createTenant({ name: "Acme Inc", slug: "acme" })
    expect(data).toEqual(createdTenant)
    expect(postMock).toHaveBeenCalledWith("/api/v1/tenants", {
      name: "Acme Inc",
      slug: "acme",
    })
  })

  it("propagates a 409 (duplicate slug) as an ApiError with status 409", async () => {
    const apiErr = new ApiError(409, { message: "Slug already in use" })
    postMock.mockRejectedValueOnce(apiErr)
    const err = await createTenant({ name: "Acme", slug: "taken" }).catch(
      (e) => e,
    )
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(409)
  })

  it("propagates a 422 (validation) as an ApiError", async () => {
    postMock.mockRejectedValueOnce(
      new ApiError(422, { message: "Invalid name" }),
    )
    await expect(
      createTenant({ name: "", slug: "x" }),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it("propagates a 401 (unauthorized) as an ApiError", async () => {
    postMock.mockRejectedValueOnce(
      new ApiError(401, { message: "Unauthorized" }),
    )
    await expect(
      createTenant({ name: "Acme", slug: "acme" }),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it("propagates a 5xx (server error) as an ApiError", async () => {
    postMock.mockRejectedValueOnce(
      new ApiError(500, { message: "Internal Server Error" }),
    )
    await expect(
      createTenant({ name: "Acme", slug: "acme" }),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it("propagates a network failure as a generic Error", async () => {
    postMock.mockRejectedValueOnce(new Error("network down"))
    await expect(
      createTenant({ name: "Acme", slug: "acme" }),
    ).rejects.toThrow(/network down/)
  })
})
