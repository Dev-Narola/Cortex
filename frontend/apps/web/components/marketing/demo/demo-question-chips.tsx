/**
 * DemoQuestionChips — the example-question
 * row above the demo input.
 *
 * **F8 Part 4.** A handful of chips that
 * pre-fill the input with a canonical
 * Cortex question. Clicking a chip
 * auto-submits the demo (per the F8 spec:
 * "I recommend: click chip → populate
 * input → automatically start demo
 * because it reduces friction").
 *
 * **Visual.** Each chip is a small rounded
 * pill with a subtle border. The active
 * chip (the one currently driving the
 * demo) uses the Spark-gradient treatment
 * so the visitor can see *which* question
 * is in flight. Real `<button>` elements
 * (not `<span onClick>`) so keyboard
 * navigation works out of the box.
 *
 * **Wrap behaviour.** The chips wrap on
 * narrow viewports (per the F8 spec:
 * "Question chips should wrap horizontally.
 * Do not make them a single unbreakable
 * row."). The container uses `flex-wrap`
 * with a small gap.
 *
 * **Decorative vs interactive.** The
 * "Try an example" eyebrow is decorative
 * copy — it sets context. The chips
 * themselves are the actual interactive
 * elements.
 */
"use client"

import { DEMO_ENTRIES, type DemoEntry } from "./demo-data"

interface DemoQuestionChipsProps {
  /** The id of the question currently
   *  driving the demo (so we can mark its
   *  chip as the active one). `null` when
   *  the user is in the initial state. */
  activeDemoId: string | null
  /** Disable all chips (e.g. while
   *  streaming). The chip is still rendered
   *  for layout stability but the click is
   *  a no-op. */
  disabled?: boolean
  /** Called when a chip is clicked. The
   *  parent decides whether to populate
   *  the input, auto-submit, or both. */
  onSelect: (entry: DemoEntry) => void
}

export function DemoQuestionChips({
  activeDemoId,
  disabled,
  onSelect,
}: DemoQuestionChipsProps) {
  return (
    <div
      data-testid="demo-question-chips"
      aria-label="Example questions"
      className="space-y-2"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Try an example
      </p>
      <ul
        role="list"
        className="flex flex-wrap gap-2"
      >
        {DEMO_ENTRIES.map((entry) => {
          const isActive = activeDemoId === entry.id
          return (
            <li key={entry.id} className="flex">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(entry)}
                aria-pressed={isActive}
                data-testid={`demo-chip-${entry.id}`}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-transparent bg-spark text-paper-50 shadow-spark"
                    : "border-border bg-background text-foreground hover:border-volt-500 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500 disabled:cursor-not-allowed disabled:opacity-50"
                }`}
              >
                {entry.chipLabel}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
