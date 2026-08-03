/**
 * Backend health probe.
 *
 * **F0 scope (Task 39).** Verifies the backend is reachable and
 * passing `/health/ready`. Used by:
 *   - The (future) landing page hero
 *   - The (future) dashboard's system-status tile
 *   - Startup checks fired from the providers
 *
 * Returns one of three states, never throws. Callers can pattern-
 * match on the `kind` discriminator without worrying about a
 * network failure leaking as an unhandled rejection.
 *
 * **No caching.** Probes always go over the wire — the backend
 * is a moving target (DB, Redis, etc.), and a cached "healthy"
 * reading would defeat the point. Callers that want to throttle
 * the probe (e.g. only re-check every 30s) own that decision.
 */

import { apiConfig } from "@cortex/config"

export type HealthStatus =
  | { kind: "healthy"; latencyMs: number; version: string | null }
  | { kind: "degraded"; latencyMs: number; body: unknown }
  | { kind: "unavailable"; reason: string }

export interface HealthCheckOptions {
  /** Override the default backend URL. Useful for tests. */
  baseUrl?: string
  /** Abort controller so callers can cap the wait time. */
  signal?: AbortSignal
  /** Per-request timeout in ms. Default 5000. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 5_000

export async function checkHealth(options: HealthCheckOptions = {}): Promise<HealthStatus> {
  const baseUrl = options.baseUrl ?? apiConfig.baseUrl
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const url = `${baseUrl.replace(/\/$/, "")}/health/ready`

  const started = performance.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  // Compose the caller's signal with our timeout signal.
  if (options.signal) {
    if (options.signal.aborted) controller.abort()
    else options.signal.addEventListener("abort", () => controller.abort())
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      // Don't follow the cookie jar — this is a public endpoint.
      credentials: "omit",
      headers: { Accept: "application/json" },
    })
    const latencyMs = Math.round(performance.now() - started)
    const body = (await res.json().catch(() => null)) as { version?: string } | null
    if (res.ok) {
      return {
        kind: "healthy",
        latencyMs,
        version: body?.version ?? null,
      }
    }
    return { kind: "degraded", latencyMs, body }
  } catch (err) {
    const reason =
      err instanceof Error
        ? err.name === "AbortError"
          ? `Timed out after ${timeoutMs}ms`
          : err.message
        : "Unknown error"
    return { kind: "unavailable", reason }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Convenience helper — narrows a `HealthStatus` to a boolean for
 * the simple "show the green dot" / "show the red dot" use case.
 */
export function isHealthy(status: HealthStatus): boolean {
  return status.kind === "healthy"
}
