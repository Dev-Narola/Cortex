/**
 * Date / time formatting.
 *
 * **F0 scope (Task 42).** Pure functions, no I/O. Single source
 * of truth for how timestamps appear in the UI.
 *
 * All formatters pin to `en-US` for F0. When i18n lands (F8+)
 * the locale flows in from the user's profile and the formatters
 * rebuild.
 *
 * Every formatter returns `"—"` for invalid input — never throws,
 * never returns `"Invalid Date"`. Callers can pass the result
 * straight into JSX without a guard.
 */

const DEFAULT_LOCALE = "en-US"
const DEFAULT_TIMEZONE = "UTC"

const dateFormatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: DEFAULT_TIMEZONE,
})

const dateTimeFormatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: DEFAULT_TIMEZONE,
})

const timeFormatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  hour: "numeric",
  minute: "2-digit",
  timeZone: DEFAULT_TIMEZONE,
})

const relFormatter = new Intl.RelativeTimeFormat(DEFAULT_LOCALE, {
  numeric: "auto",
})

function toDate(value: Date | number | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "Mar 14, 2026" — date only. */
export function formatDate(value: Date | number | string): string {
  const d = toDate(value)
  return d ? dateFormatter.format(d) : "—"
}

/** "Mar 14, 2026, 9:00 AM" — date + time. */
export function formatDateTime(value: Date | number | string): string {
  const d = toDate(value)
  return d ? dateTimeFormatter.format(d) : "—"
}

/** "9:00 AM" — time only. */
export function formatTime(value: Date | number | string): string {
  const d = toDate(value)
  return d ? timeFormatter.format(d) : "—"
}

/**
 * "just now" / "5 min ago" / "in 2 days" — relative to `now`.
 * Resolves to the largest unit that produces a non-zero value.
 */
export function formatRelative(
  value: Date | number | string,
  now: Date | number = Date.now(),
): string {
  const d = toDate(value)
  const n = toDate(now)
  if (!d || !n) return "—"
  const diffMs = d.getTime() - n.getTime()
  const absSec = Math.abs(diffMs) / 1000

  // Pick the largest unit with a meaningful value.
  const units: Array<{ unit: Intl.RelativeTimeFormatUnit; seconds: number }> = [
    { unit: "year", seconds: 365 * 24 * 60 * 60 },
    { unit: "month", seconds: 30 * 24 * 60 * 60 },
    { unit: "day", seconds: 24 * 60 * 60 },
    { unit: "hour", seconds: 60 * 60 },
    { unit: "minute", seconds: 60 },
    { unit: "second", seconds: 1 },
  ]
  for (const { unit, seconds } of units) {
    if (absSec >= seconds) {
      return relFormatter.format(Math.round(-diffMs / 1000 / seconds), unit)
    }
  }
  return "just now"
}

/** True if `value` is a valid parseable date. */
export function isValidDate(value: unknown): value is Date | string | number {
  if (value instanceof Date) return !Number.isNaN(value.getTime())
  if (typeof value === "string" || typeof value === "number") {
    return !Number.isNaN(new Date(value).getTime())
  }
  return false
}
