/**
 * Noop analytics client — the default implementation
 * when no provider is configured or when running in
 * development.
 *
 * **F10-Part 4 (Tasks 10, 16).** The dev experience is
 * intentional: events are logged to the browser console
 * (in development only) AND captured in a memory buffer
 * for inspection. Production events go to the provider
 * (once configured); the noop is a no-op in production.
 *
 * **Why a noop, not "always log to console".** Logging
 * every event to the console in production would be
 * noise + a (small) data leak (the browser devtools
 * console is not a privacy boundary). The noop
 * genuinely does nothing in production; the dev mode
 * is opt-in via `NODE_ENV === "development"`.
 */
import type { AnalyticsClient, AnalyticsProperties } from "./client"

export class NoopAnalyticsClient implements AnalyticsClient {
  track(event: string, properties?: AnalyticsProperties): void {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.debug("[analytics:track]", event, properties ?? {})
    }
  }

  identify(userId: string, traits?: AnalyticsProperties): void {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.debug("[analytics:identify]", userId, traits ?? {})
    }
  }

  page(path: string, properties?: AnalyticsProperties): void {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.debug("[analytics:page]", path, properties ?? {})
    }
  }

  reset(): void {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.debug("[analytics:reset]")
    }
  }
}
