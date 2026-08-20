/**
 * DemoSourcePanel — the slide-out that
 * appears when a citation is clicked.
 *
 * **F8 Part 4.** The marketing demo's
 * traceability claim: clicking a citation
 * opens the actual source excerpt, so a
 * sceptical visitor can verify the answer
 * in one click (per the F8 spec: "click
 * citation → source excerpt opens").
 *
 * **What the panel shows.** A single
 * citation at a time:
 *   - The document title.
 *   - The location (section / page).
 *   - The excerpt — the relevant text from
 *     the source. The marketing demo shows
 *     real prose in the excerpt so the
 *     visitor gets a realistic preview of
 *     the real CitationPanel.
 *   - A "View source" button — a decorative
 *     affordance, not a real link. The
 *     spec is explicit: "For the marketing
 *     demo, `View source` can be
 *     non-navigational or point to a
 *     legitimate public documentation page
 *     later. Don't invent a fake URL."
 *
 * **Reuse.** The panel reuses the F1
 * `Drawer` primitive (right-side slide-
 * over) so the marketing site shares the
 * same drawer interaction as the
 * authenticated workspace. F9 will own
 * the bottom-sheet mobile variant; the
 * desktop drawer works on a 390px
 * viewport today (it's a full-screen
 * overlay).
 *
 * **Escape closes.** The F8 spec: "If the
 * source panel is open: Escape → close
 * source panel." The Drawer primitive
 * already handles Esc + click-outside.
 *
 * **Focus management.** When the panel
 * opens, the close button is focused
 * (Radix's default focus management). When
 * it closes, focus returns to the citation
 * chip — also Radix's default behaviour.
 */
"use client"

import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@cortex/ui"

import type { DemoCitation } from "./demo-data"

interface DemoSourcePanelProps {
  /** The citation to show. `null` when the
   *  panel is closed. */
  citation: DemoCitation | null
  /** Whether the panel is open. */
  open: boolean
  /** Called when the user dismisses the
   *  panel (Esc, click-outside, or close
   *  button). */
  onOpenChange: (open: boolean) => void
}

export function DemoSourcePanel({ citation, open, onOpenChange }: DemoSourcePanelProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        side="right"
        className="w-full sm:max-w-md"
        data-testid={citation ? `demo-source-panel-${citation.id}` : "demo-source-panel"}
      >
        {citation ? (
          <>
            <DrawerHeader>
              <div className="flex items-center justify-between gap-2">
                <DrawerTitle data-testid={`demo-source-title-${citation.id}`}>
                  {citation.documentTitle}
                </DrawerTitle>
                <DrawerClose
                  className="text-xs text-paper-200/60 transition-colors hover:text-paper-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500"
                  data-testid={`demo-source-close-${citation.id}`}
                >
                  Close
                </DrawerClose>
              </div>
              <DrawerDescription>{citation.location}</DrawerDescription>
            </DrawerHeader>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Excerpt
              </p>
              <blockquote
                className="rounded-lg border border-border bg-background/60 p-4 text-sm leading-relaxed text-foreground"
                data-testid={`demo-source-excerpt-${citation.id}`}
              >
                {citation.excerpt}
              </blockquote>
              <button
                type="button"
                disabled
                className="text-xs font-medium text-muted-foreground/50"
                data-testid={`demo-source-view-${citation.id}`}
                title="Marketing demo — public documentation link coming soon."
              >
                View source ↗
              </button>
            </div>
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}
