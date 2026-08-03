/**
 * Number / byte / currency formatting.
 *
 * **F0 scope (Task 42).** Pure functions, no I/O, no business
 * logic. The single source of truth for how numbers appear in
 * the UI — when the design system tightens (e.g. "always two
 * significant digits for latency"), this is the only file that
 * changes.
 *
 * Locale is intentionally pinned to `en-US` for F0. i18n (F8+)
 * is the place to thread a locale through here.
 */

const DEFAULT_LOCALE = "en-US"

const numberFormatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
  maximumFractionDigits: 0,
})

const numberFormatter2dp = new Intl.NumberFormat(DEFAULT_LOCALE, {
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
  style: "percent",
  maximumFractionDigits: 1,
})

const usdFormatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

/** "1,234" — for whole numbers, no decimals. */
export function formatInt(value: number): string {
  if (!Number.isFinite(value)) return "—"
  return numberFormatter.format(value)
}

/** "1,234.56" — for amounts that want up to 2 fractional digits. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—"
  return numberFormatter2dp.format(value)
}

/** "12.3%" — clamps the input to [0, 1]. */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—"
  const clamped = Math.max(0, Math.min(1, value))
  return percentFormatter.format(clamped)
}

/** "$1,234.56" — USD. Other currencies come when i18n lands. */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "—"
  return usdFormatter.format(value)
}

/** "1.2K", "3.4M", "5.6B" — for compact headline numbers. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "—"
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

/** "1.2 MB", "5.6 GB" — byte sizes, 1000-base. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—"
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB", "PB"]
  const i = Math.min(units.length - 1, Math.floor(Math.log10(bytes) / 3))
  const value = bytes / 10 ** (i * 3)
  return `${formatNumber(value)} ${units[i]}`
}

/** "12ms" / "1.2s" / "2m 5s" — humanised durations. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—"
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${formatNumber(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const remSeconds = Math.round(seconds % 60)
  return `${minutes}m ${remSeconds}s`
}
