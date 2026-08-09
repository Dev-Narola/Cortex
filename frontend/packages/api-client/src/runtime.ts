/**
 * Runtime — the hand-written fetch wrapper that powers the
 * generated client.
 *
 * The generated `types.ts` provides the TypeScript schema; this
 * file provides the behaviour: auth headers, error mapping,
 * retry on 401, and the optional base-URL override.
 *
 * The shape of the returned object is compatible with
 * `openapi-fetch`, so the generated client can be used directly
 * if a future contributor prefers.
 */

import { publicEnv } from "@cortex/config"

export type AccessTokenProvider = () => string | null | Promise<string | null>
export type RefreshHandler = () => Promise<boolean>
/**
 * Optional callback invoked when the server returns
 * 429. The handler receives the parsed `Retry-After`
 * header in milliseconds (when present) so the host
 * app can surface a rate-limit banner. F4 Part 4
 * (Task 97) wires this to the global rate-limit store.
 */
export type RateLimitedHandler = (input: {
  retryAfterMs: number | null
  message: string | null
}) => void

export interface ApiClientConfig {
  baseUrl?: string
  getAccessToken?: AccessTokenProvider
  onUnauthorized?: RefreshHandler
  onRateLimited?: RateLimitedHandler
}

export class ApiError extends Error {
  public readonly status: number
  public readonly body: unknown

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API error ${status}`)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

export class ApiClient {
  private baseUrl: string
  private getAccessToken?: AccessTokenProvider
  private onUnauthorized?: RefreshHandler
  private onRateLimited?: RateLimitedHandler

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? publicEnv.NEXT_PUBLIC_API_URL
    this.getAccessToken = config.getAccessToken
    this.onUnauthorized = config.onUnauthorized
    this.onRateLimited = config.onRateLimited
  }

  async request<T = unknown>(
    method: string,
    path: string,
    init?: {
      body?: unknown
      query?: Record<string, unknown>
      headers?: Record<string, string>
      signal?: AbortSignal
    },
  ): Promise<T> {
    const url = new URL(path, this.baseUrl)
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v))
        }
      }
    }

    const isFormData = init?.body instanceof FormData
    const headers: Record<string, string> = isFormData
      ? { Accept: "application/json", ...(init?.headers ?? {}) }
      : {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init?.headers ?? {}),
        }

    const token = await this.getAccessToken?.()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    let res = await fetch(url.toString(), {
      method,
      headers,
      body: init?.body
        ? isFormData
          ? (init.body as FormData)
          : JSON.stringify(init.body)
        : undefined,
      signal: init?.signal,
      credentials: "include",
    })

    // Silent refresh + retry on 401 — mirrors the auth/refresh
    // pattern documented in Docs/frontend/real-time.md.
    if (res.status === 401 && this.onUnauthorized) {
      const recovered = await this.onUnauthorized()
      if (recovered) {
        const retryToken = await this.getAccessToken?.()
        if (retryToken) headers.Authorization = `Bearer ${retryToken}`
        res = await fetch(url.toString(), {
          method,
          headers,
          body: init?.body
            ? isFormData
              ? (init.body as FormData)
              : JSON.stringify(init.body)
            : undefined,
          signal: init?.signal,
          credentials: "include",
        })
      }
    }

    if (!res.ok) {
      const body = await res.json().catch(() => null)
      // 429: parse the Retry-After header (seconds
      // per RFC 9110) and notify the host. We
      // don't throw here for the 429 — the banner
      // + the per-call handler decide what to do.
      if (res.status === 429 && this.onRateLimited) {
        const retryHeader = res.headers.get("Retry-After")
        const retrySeconds = retryHeader
          ? Number.parseInt(retryHeader, 10)
          : Number.NaN
        const retryAfterMs = Number.isFinite(retrySeconds)
          ? retrySeconds * 1000
          : null
        const bodyMessage =
          body && typeof body === "object" && "message" in body
            ? String((body as { message?: unknown }).message ?? "")
            : null
        this.onRateLimited({ retryAfterMs, message: bodyMessage })
      }
      throw new ApiError(res.status, body)
    }

    // 204 No Content
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  get<T = unknown>(path: string, query?: Record<string, unknown>) {
    return this.request<T>("GET", path, { query })
  }
  post<T = unknown>(
    path: string,
    body?: unknown,
    init?: {
      query?: Record<string, unknown>
      headers?: Record<string, string>
      signal?: AbortSignal
    },
  ) {
    return this.request<T>("POST", path, { body, ...init })
  }
  patch<T = unknown>(
    path: string,
    body?: unknown,
    init?: {
      query?: Record<string, unknown>
      headers?: Record<string, string>
      signal?: AbortSignal
    },
  ) {
    return this.request<T>("PATCH", path, { body, ...init })
  }
  put<T = unknown>(
    path: string,
    body?: unknown,
    init?: {
      query?: Record<string, unknown>
      headers?: Record<string, string>
      signal?: AbortSignal
    },
  ) {
    return this.request<T>("PUT", path, { body, ...init })
  }
  delete<T = unknown>(
    path: string,
    init?: {
      query?: Record<string, unknown>
      headers?: Record<string, string>
      signal?: AbortSignal
    },
  ) {
    return this.request<T>("DELETE", path, init)
  }
}
