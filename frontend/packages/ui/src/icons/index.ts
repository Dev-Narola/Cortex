/**
 * Icons — barrel.
 *
 * Re-exported by `@cortex/ui`; never imported directly by app code.
 *
 * **F1 Part 4 (Task 34).** The Icon component is the single
 * entry point for every icon in the app. Categorised lists
 * (`ICON_ACTIONS`, `ICON_NAVIGATION`, etc.) live in
 * `categories.ts` for reference + linting.
 *
 * **Replacing the icon set.** To swap lucide for a different
 * icon family in the future, change `Icon.tsx` (the lookup
 * function) and `categories.ts` (the curated name list).
 * Nothing else needs to move.
 */

export { Icon, type IconName, type IconSize, type IconTone, type IconProps } from "./Icon"
export type { IconNode, LucideIcon } from "./Icon"
export {
  ICON_ACTIONS,
  ICON_AGENTS,
  ICON_CATEGORIES,
  ICON_DOCUMENTS,
  ICON_NAVIGATION,
  ICON_SETTINGS,
  ICON_STATUS,
  type IconCategory,
  iconCategory,
} from "./categories"
