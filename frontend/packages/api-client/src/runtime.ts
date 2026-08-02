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

export interface ApiClientConfig {
  baseUrl?: string
  getAccessToken?: AccessTokenProvider
  onUnauthorized?: () => Promise<boolean>
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

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? publicEnv.NEXT_PUBLIC_API_URL
    this.getAccessToken = config.getAccessToken
    this.onUnauthorized = config.onUnauthorized
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

    const headers: Record<string, string> = {
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
      body: init?.body ? JSON.stringify(init.body) : undefined,
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
          body: init?.body ? JSON.stringify(init.body) : undefined,
          signal: init?.signal,
          credentials: "include",
        })
      }
    }

    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new ApiError(res.status, body)
    }

    // 204 No Content
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  get<T = unknown>(path: string, query?: Record<string, unknown>) {
    return this.request<T>("GET", path, { query })
  }
  post<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("POST", path, { body })
  }
  patch<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, { body })
  }
  put<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("PUT", path, { body })
  }
  delete<T = unknown>(path: string) {
    return this.request<T>("DELETE", path)
  }
}
