/**
 * `cn()` — class-name composer.
 *
 * **F0 scope (Task 42).** Wraps `clsx` + `tailwind-merge` so
 * conflicting Tailwind utilities resolve predictably (the last
 * one wins, regardless of input order).
 *
 * Why a wrapper instead of importing `clsx`/`tailwind-merge`
 * directly in every file? Two reasons:
 *   1. **Single audit point.** The shadcn ecosystem has settled
 *      on `clsx + twMerge`; if we ever swap, this is the only
 *      file that changes.
 *   2. **Stable types.** `cn()` accepts the same inputs as
 *      `clsx` so call-sites don't have to learn a new type.
 */

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
