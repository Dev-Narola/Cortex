/**
 * Analytics — public module entry point.
 *
 * F10-Part 4 ships the provider-agnostic abstraction. A
 * real provider (Plausible, PostHog, Umami, etc.) is a
 * 1-file change: add `lib/analytics/provider/<name>.ts`
 * + register the import in `lib/analytics/provider/index.ts`.
 *
 * **Usage:**
 *
 * ```ts
 * import {
 *   MARKETING_CTA_CLICKED,
 *   track,
 * } from "@/lib/analytics"
 *
 * // On click of the hero CTA
 * track(MARKETING_CTA_CLICKED, { location: "hero" })
 * ```
 */
export * from "./track"
export { setAnalyticsClient, getAnalyticsClient, bootConfiguredProvider } from "./provider"
export type { AnalyticsClient, AnalyticsProperties, AllowedValue } from "./provider/client"
