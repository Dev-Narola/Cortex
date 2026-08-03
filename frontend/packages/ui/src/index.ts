/**
 * `@cortex/ui` — the Cortex design system.
 *
 * **F1 scope.** Single barrel re-export for every component,
 * typography primitive, icon, and utility. App code does:
 *
 *   import { Button, Card, Icon } from "@cortex/ui"
 *
 * — never reaches into `components/...` directly. That's the
 * discipline the F1 export convention enforces; if a new
 * component ships, adding it here makes it auto-discoverable
 * for every screen.
 *
 * **Folder map.**
 *   - components/buttons/      Button
 *   - components/forms/        Input, Label, Select
 *   - components/cards/        Card, CardHeader, CardTitle, …
 *   - components/dialogs/      Dialog, DialogContent, DialogTitle, …
 *   - components/navigation/   Tabs, TabsList, TabsTrigger, TabsContent
 *   - components/feedback/     Badge, Toast, useToast, toast()
 *   - components/tables/       (empty — Table ships in F1 Part 2+)
 *   - components/layout/       Separator
 *   - components/typography/    (placeholder — typography lives at top level)
 *   - typography/              Heading, Text, Caption, Code, Link
 *   - icons/                   Icon (lucide-react wrapper)
 *   - utils/                   cn (clsx + tailwind-merge)
 *   - hooks/                   (empty placeholder; future F1 hooks)
 *   - styles/                  tokens.css + globals.css (consumed by app)
 */

// Styles — side-effect import so Tailwind sees the @theme block.
import "./styles/globals.css"

// Category barrels
export * from "./components/buttons"
export * from "./components/cards"
export * from "./components/forms"
export * from "./components/dialogs"
export * from "./components/navigation"
export * from "./components/feedback"
export * from "./components/layout"
// tables + components/typography are intentionally not re-exported:
// tables/ is empty (F1 Part 2 work) and components/typography/ is a
// placeholder — the real typography lives at the top level.

// Top-level typography + icon + utils
export * from "./typography"
export * from "./icons"
export * from "./utils"
