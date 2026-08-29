/**
 * Provider registry — the single chokepoint that maps an
 * `AnalyticsClient` to a runtime instance.
 *
 * **F10-Part 4 (Task 10).** Default is the noop client.
 * A real provider (Plausible, PostHog, Umami, etc.) is
 * a 1-file implementation in `./<name>.ts` plus an
 * entry in the switch below.
 *
 * **Why a registry, not direct imports.** The call
 * sites (in components) import `track` from
 * `./track.ts`. The track function asks the registry
 * "who's the current client?" and dispatches. The
 * registry is set ONCE in `app/providers.tsx` (or
 * where the analytics provider boots) and never
 * re-bound. This makes the provider replaceable
 * without touching any call site.
 *
 * **Env-driven selection.** The registry reads
 * `process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER` (added
 * in `packages/config/src/env.ts`) and picks the
 * matching client. Unknown / missing values fall
 * back to noop.
 */
import type { AnalyticsClient } from "./client"
import { NoopAnalyticsClient } from "./noop"

let current: AnalyticsClient = new NoopAnalyticsClient()

/**
 * Set the active client. Called once at app boot
 * (or in the analytics provider's `init()`). The
 * caller is responsible for choosing the right
 * client; this function does not validate.
 */
export function setAnalyticsClient(client: AnalyticsClient): void {
  current = client
}

/**
 * Get the active client. The track / identify / page
 * / reset helpers in `track.ts` call this.
 */
export function getAnalyticsClient(): AnalyticsClient {
  return current
}

/**
 * Boot the provider configured by the env. Called
 * once at app boot (from `app/providers.tsx` or
 * similar). Unknown provider names are silent
 * fallbacks to the noop — the team picks the
 * provider via env, and the deploy can be rolled
 * back without code changes.
 */
export function bootConfiguredProvider(): void {
  const provider = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER
  if (!provider || provider === "noop") {
    // Noop is the default. Nothing to do.
    return
  }

  // Real providers would be added here as the team
  // selects them. The shape of each provider is a
  // 1-file module in `./provider/<name>.ts` that
  // exports an `init(): AnalyticsClient` function.
  //
  // switch (provider) {
  //   case "plausible":
  //     setAnalyticsClient(initPlausible())
  //     break
  //   case "posthog":
  //     setAnalyticsClient(initPostHog())
  //     break
  //   default:
  //     // Unknown provider — fall back to noop. Log
  //     // a warning so the team notices the misconfig.
  //     if (process.env.NODE_ENV === "development") {
  //       // eslint-disable-next-line no-console
  //       console.warn(
  //         `[analytics] Unknown provider "${provider}"; falling back to noop.`,
  //       )
  //     }
  // }
}
