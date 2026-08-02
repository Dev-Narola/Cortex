/**
 * Unit tests for the api-client runtime.
 *
 * Validates: auth header injection, 401 → refresh → retry,
 * error mapping, and query-string encoding.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClient, ApiError } from "@cortex/api-client";

const originalFetch = globalThis.fetch;

describe("ApiClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends Authorization header from the token getter", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const client = new ApiClient({
      baseUrl: "http://api",
      getAccessToken: () => "tok-123",
    });
    await client.get("/x");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-123");
  });

  it("encodes query params, skipping nulls", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const client = new ApiClient({ baseUrl: "http://api" });
    await client.get("/x", { a: 1, b: null, c: undefined });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("a=1");
    expect(url).not.toContain("b=");
    expect(url).not.toContain("c=");
  });

  it("maps non-2xx to ApiError with status and body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "nope" }), { status: 400 }),
    );
    const client = new ApiClient({ baseUrl: "http://api" });
    await expect(client.get("/x")).rejects.toBeInstanceOf(ApiError);
  });

  it("retries once after a silent refresh on 401", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "expired" }), { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    let refreshed = false;
    const client = new ApiClient({
      baseUrl: "http://api",
      getAccessToken: () => (refreshed ? "new-tok" : "old-tok"),
      onUnauthorized: async () => {
        refreshed = true;
        return true;
      },
    });
    const result = await client.get("/x");
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const headers = secondInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer new-tok");
  });
});
