/**
 * Utility: `cn` — Tailwind class-name joiner.
 *
 * The shared helper used by every shadcn-style primitive.
 * `clsx` resolves conditional class names; `tailwind-merge`
 * removes conflicting utilities (e.g. `p-2 p-4` → `p-4`).
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
