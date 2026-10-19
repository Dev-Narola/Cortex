import type { ReactNode } from "react"

const MARK = "rounded-sm bg-brand-soft px-0.5 text-foreground ring-1 ring-brand-border"

/** Wrap each query term (3+ chars, case-insensitive) found in `text` in <mark>. */
export function highlight(text: string, query: string): ReactNode[] {
  const terms = [
    ...new Set(
      query
        .toLowerCase()
        .split(/\W+/)
        .filter((t) => t.length >= 3),
    ),
  ]
  if (terms.length === 0) return [text]
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  // Capturing split keeps the matches at odd indexes.
  return text.split(new RegExp(`(${escaped.join("|")})`, "gi")).map((part, i) =>
    i % 2 === 1 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and static per render
      <mark key={i} className={MARK}>
        {part}
      </mark>
    ) : (
      part
    ),
  )
}
