/**
 * `@cortex/ui` — the Cortex design system.
 *
 * **F1 Part 2.** Single barrel re-export for every component.
 * App code does:
 *
 *   import { Button, Card, Icon } from "@cortex/ui"
 *
 * — never reaches into `components/...` directly.
 *
 * **Folder map.**
 *   - components/buttons/      Button
 *   - components/cards/        Card + compound parts
 *   - components/forms/        Input, Textarea, Label, Checkbox, RadioGroup, Switch, Select
 *   - components/dialogs/      Dialog + compound parts
 *   - components/navigation/   Tabs
 *   - components/feedback/     Toast, Spinner, Skeleton, Tooltip
 *   - components/data-display/ Avatar, Badge
 *   - components/layout/       Separator
 *   - components/tables/       (empty — F1 Part 3+)
 *   - typography/              Heading, Text, Caption, Code, Link
 *   - icons/                   Icon
 *   - utils/                   cn
 *   - hooks/                   (empty placeholder)
 *   - styles/                  tokens.css + globals.css
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
export * from "./components/data-display"
export * from "./components/layout"
// tables/ is intentionally not re-exported yet — F1 Part 3+ work.

// Top-level primitives
export * from "./typography"
export * from "./icons"
export * from "./utils"
