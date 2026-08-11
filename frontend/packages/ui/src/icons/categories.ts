/**
 * Icon categories — the curated, single-source-of-truth set of
 * lucide icon names used by the Cortex design system.
 *
 * **F1 Part 4 (Task 34).** Every lucide name the app uses
 * is categorised here. The category list mirrors the route
 * structure of the authenticated app, so a future redesign
 * (or a swap to a different icon set) only needs to update
 * the per-category map — never the call sites.
 *
 * **Categories.**
 *   - `actions`    — verb icons (add, edit, delete, search, etc.)
 *   - `navigation` — nav (chevrons, arrows, menu, home, settings)
 *   - `status`     — state / feedback (check, x, alert, info, loader)
 *   - `documents`  — content shapes (file, folder, upload, download)
 *   - `agents`     — agent / AI / chat (bot, sparkles, message)
 *   - `settings`   — preference / system (sliders, key, shield, bell)
 *
 * **Usage.** App code should use the categories as semantic
 * shorthand when picking an icon. The category maps are
 * re-exported via the `icons/` barrel; the actual
 * `<Icon name="..." />` component still accepts the literal
 * lucide name (we don't introduce a new name space).
 *
 * **No dead icons.** If a lucide name is imported but not
 * listed here, the bundle will still ship the SVG — but
 * the lint rule (when added) will catch it.
 */

export const ICON_ACTIONS = [
  "Plus",
  "Minus",
  "X",
  "Check",
  "Search",
  "Edit",
  "Trash",
  "Copy",
  "Save",
  "Filter",
  "Download",
  "Upload",
  "Share",
  "Send",
  "MoreHorizontal",
  "MoreVertical",
  "Eye",
  "EyeOff",
  "Lock",
  "Unlock",
  "RefreshCw",
  "RotateCw",
  "ExternalLink",
  "Link",
  "LogIn",
  "LogOut",
  "ThumbsUp",
  "ThumbsDown",
  "Ellipsis",
  "EllipsisVertical",
  "Pencil",
] as const

export const ICON_NAVIGATION = [
  "ChevronLeft",
  "ChevronRight",
  "ChevronUp",
  "ChevronDown",
  "ChevronsLeft",
  "ChevronsRight",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "ArrowUpRight",
  "Menu",
  "Home",
  "PanelLeft",
  "PanelRight",
  "Settings",
  "User",
  "Users",
  "UserPlus",
] as const

export const ICON_STATUS = [
  "CheckCircle2",
  "XCircle",
  "CircleAlert",
  "TriangleAlert",
  "Info",
  "HelpCircle",
  "Loader2",
  "Circle",
  "CircleDot",
  "CircleSlash",
  "Clock",
  "Calendar",
  "ZapOff",
] as const

export const ICON_DOCUMENTS = [
  "File",
  "FileText",
  "FilePlus",
  "FileSearch",
  "FileX",
  "Files",
  "Folder",
  "FolderOpen",
  "FolderPlus",
  "BookOpen",
  "BookMarked",
  "Library",
  "Paperclip",
  "Image",
  "Film",
  "Music",
] as const

export const ICON_AGENTS = [
  "Bot",
  "Sparkles",
  "MessageSquare",
  "MessageCircle",
  "MessagesSquare",
  "Wand2",
  "Lightbulb",
  "Network",
  "GitBranch",
  "Workflow",
  "Cpu",
  "BrainCircuit",
] as const

export const ICON_SETTINGS = [
  "SlidersHorizontal",
  "Sliders",
  "ToggleLeft",
  "ToggleRight",
  "Key",
  "KeyRound",
  "Shield",
  "ShieldCheck",
  "Bell",
  "BellRing",
  "CreditCard",
  "Receipt",
  "BarChart3",
  "PieChart",
  "LineChart",
  "Activity",
  "Zap",
  "Moon",
  "Sun",
  "Globe",
  "Languages",
] as const

export type IconCategory = "actions" | "navigation" | "status" | "documents" | "agents" | "settings"

export const ICON_CATEGORIES = {
  actions: ICON_ACTIONS,
  navigation: ICON_NAVIGATION,
  status: ICON_STATUS,
  documents: ICON_DOCUMENTS,
  agents: ICON_AGENTS,
  settings: ICON_SETTINGS,
} as const

/**
 * Resolve a lucide icon name to its category. Returns `null`
 * if the name is not in any of the curated lists.
 */
export function iconCategory(name: string): IconCategory | null {
  for (const [category, list] of Object.entries(ICON_CATEGORIES) as Array<
    [IconCategory, readonly string[]]
  >) {
    if (list.includes(name)) return category
  }
  return null
}
