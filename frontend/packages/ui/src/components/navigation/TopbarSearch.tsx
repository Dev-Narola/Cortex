/**
 * TopbarSearch — the topbar search placeholder.
 *
 * **F1 Part 3 (Task 27).** Visual-only search field for
 * the topbar. Renders an icon + a label + a kbd hint
 * (e.g. `⌘K`). Wiring the actual search happens in F2+
 * (the call site provides the input element + onChange).
 *
 * **F1 only ships the visual shell.** Apps wire their
 * own `command-k` palette via a `<Dialog>` + a
 * `cmdk` component. F1 just provides the trigger
 * surface.
 */

import { Search } from "lucide-react"
import { type ButtonHTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

export interface TopbarSearchProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Hint label. Default `"Search…"`. */
  placeholder?: string
  /** Keyboard hint label. Default `"⌘K"`. */
  shortcut?: string
}

const TopbarSearch = forwardRef<HTMLButtonElement, TopbarSearchProps>(
  ({ className, placeholder = "Search…", shortcut = "⌘K", ...props }, ref) => {
    const classNames = cn(
      "flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground",
      "transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )
    return (
      <button ref={ref} type="button" className={classNames} {...props}>
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">{placeholder}</span>
        <kbd className="hidden rounded border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground sm:inline">
          {shortcut}
        </kbd>
      </button>
    )
  },
)
TopbarSearch.displayName = "TopbarSearch"

export { TopbarSearch }
