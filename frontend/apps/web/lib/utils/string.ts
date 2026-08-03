/**
 * String helpers.
 *
 * **F0 scope (Task 42).** Pure functions, no I/O. Things that
 * would otherwise get inlined into five different components
 * and drift apart the first time someone tweaks one of them.
 */

/** `Hello World` — title-case each whitespace-separated word. */
export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/(\s+)/)
    .map((chunk) => (/\s+/.test(chunk) ? chunk : chunk.charAt(0).toUpperCase() + chunk.slice(1)))
    .join("")
}

/** `HELLO_WORLD` → `Hello World`. */
export function snakeToTitle(value: string): string {
  return titleCase(value.replace(/_/g, " "))
}

/** `Hello World` → `HELLO_WORLD`. */
export function titleToSnake(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toUpperCase()
}

/** `HelloWorld` → `hello-world` (kebab-case, useful for slugs). */
export function camelToKebab(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase()
}

/** `"a, b, c"` → `"a, b, and c"` (Oxford comma). */
export function joinNaturalized(parts: ReadonlyArray<string>): string {
  if (parts.length === 0) return ""
  if (parts.length === 1) return parts[0] ?? ""
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  const last = parts[parts.length - 1]
  return `${parts.slice(0, -1).join(", ")}, and ${last}`
}

/** "  Hello  " → "Hello". */
export function trim(value: string): string {
  return value.trim()
}

/** Returns `value` if truthy, else `fallback`. */
export function withFallback<T>(value: T | null | undefined, fallback: T): T {
  return value ?? fallback
}

/** Caps a string to `max` characters, appending "…" when truncated. */
export function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1))}…`
}

/**
 * Strip combining diacritical marks from a string.
 * Used by `slugify` to convert "café" → "cafe".
 *
 * Built from `String.fromCharCode` + `RegExp` so the regex
 * contains a single combined character class — no
 * literal combining characters in the source that linters
 * would flag as misleading.
 */
const COMBINING_MARKS_START = 0x0300
const COMBINING_MARKS_END = 0x036f
const COMBINING_MARKS_CLASS = `[${String.fromCharCode(
  COMBINING_MARKS_START,
)}-${String.fromCharCode(COMBINING_MARKS_END)}]`
const COMBINING_MARKS_PATTERN = new RegExp(`${COMBINING_MARKS_CLASS}+`, "g")

/** Lower-cased, ASCII-only, URL-safe. Stable across runs. */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(COMBINING_MARKS_PATTERN, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

/** First character upper-cased, rest untouched. */
export function capitalize(value: string): string {
  if (value.length === 0) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** Opaque random ID. Browser-only — throws on the server. */
export function randomId(prefix = "id"): string {
  if (typeof crypto === "undefined" || !("randomUUID" in crypto)) {
    throw new Error("randomId() requires the Web Crypto API")
  }
  return `${prefix}_${crypto.randomUUID()}`
}
