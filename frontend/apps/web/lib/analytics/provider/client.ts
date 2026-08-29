/**
 * Analytics client interface — the single chokepoint that
 * every F10-Part 4 call site talks to.
 *
 * **F10-Part 4 (Tasks 8, 10).** The frontend talks to
 * `track()` in `./track.ts`, which dispatches to whatever
 * client is bound via `setAnalyticsClient()`. A real
 * provider (Plausible, PostHog, Umami, etc.) is a 1-file
 * implementation of this interface in
 * `./provider/<name>.ts`.
 *
 * **Provider-agnostic.** The contract is the `track` +
 * `identify` + `page` methods. Everything else (consent
 * management, server-side ingest, sampling, retries) is
 * the provider's concern, not the call site's.
 *
 * **Privacy contract (Tasks 7, 19).** The interface
 * deliberately does NOT accept free-text payloads. The
 * `properties` parameter is `Record<string, AllowedValue>`
 * where `AllowedValue` is a string / number / boolean /
 * enum. A real provider implementation MUST enforce
 * this server-side too — the client is the first line
 * of defense, the provider's ingest is the second.
 */
export type AllowedValue = string | number | boolean

/**
 * `properties` is a flat key/value map. No nested objects,
 * no free-form strings. Every value is one of:
 *
 * - `string` — typically a closed enum (e.g.
 *   `location: "hero" | "feature" | "final"`).
 * - `number` — for counters and durations.
 * - `boolean` — for flags (e.g. `invite_token: true`).
 *
 * The TypeScript type is intentionally restrictive to
 * prevent accidental inclusion of free-text or PII.
 */
export type AnalyticsProperties = Record<string, AllowedValue>

/**
 * The contract every analytics provider must satisfy.
 *
 * The default implementation is `NoopAnalyticsClient` in
 * `./noop.ts` (used in development + when no provider is
 * configured). A real implementation lives in
 * `./provider/<name>.ts`.
 */
export interface AnalyticsClient {
  /**
   * Fire a custom event. The event name is dot-namespaced
   * (`marketing_cta_clicked`, `signup_completed`,
   * `first_document_uploaded`, etc.).
   *
   * The provider MUST validate that:
   * - the event name is in the documented catalog
   *   (`docs/frontend/analytics-events.md`); events
   *   outside the catalog are dropped (or the call
   *   returns `false` to signal "not tracked")
   * - the properties object is flat (no nested objects)
   * - no property value contains PII (email, IP, name,
   *   phone, address, etc.) — the provider's server-side
   *   ingest is the second line of defense
   */
  track(
    event: string,
    properties?: AnalyticsProperties,
  ): void

  /**
   * Identify a user after authentication. The argument is
   * a **stable, opaque user ID** — typically a UUID the
   * backend issues, NOT the user's email. The provider
   * must NOT receive the user's email, name, or any
   * PII.
   */
  identify(userId: string, traits?: AnalyticsProperties): void

  /**
   * Track a page view. Called by the router on every
   * navigation. The `path` argument is the current URL
   * path; the provider can decide whether to send the
   * full path, the path without the query string, or
   * the path with the query string hashed.
   */
  page(path: string, properties?: AnalyticsProperties): void

  /**
   * Reset the current user. Called on logout. The
   * provider must forget the current user ID + traits
   * so the next event isn't attributed to the previous
   * user.
   */
  reset(): void
}
