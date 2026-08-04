/**
 * Navigation — barrel for Sidebar / Topbar / UserMenu / Logo /
 * Tabs / Breadcrumb / Pagination.
 *
 * Re-exported by `@cortex/ui`; never imported directly by app code.
 *
 * **F1 Part 3 (Tasks 24, 27, 28, 29).** Every chrome primitive
 * the authenticated app layout consumes. F1 ships the
 * visuals only — no routing, no data hooks.
 *
 * **Sidebar hierarchy.**
 *   - `<Sidebar state="expanded | collapsed | mobile">`
 *     - `<Logo />`
 *     - `<SidebarSection label="Workspace">`
 *       - `<SidebarItem iconLeft={...}>` rows
 *     - `</SidebarSection>`
 *     - `<SidebarFooter>`
 *       - `<UserMenu />`
 *     - `</SidebarFooter>`
 *   - `</Sidebar>`
 *
 * **Topbar hierarchy.**
 *   - `<Topbar start={...} center={...} end={...}>`
 *     - start: menu toggle + `<Breadcrumb />`
 *     - center: `<TopbarSearch />`
 *     - end: notifications + `<UserMenu />`
 *   - `</Topbar>`
 */

export { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs"

export { Logo, type LogoProps, type LogoSize } from "./Logo"

export {
  Sidebar,
  type SidebarProps,
  type SidebarState,
} from "./Sidebar"
export { SidebarItem, type SidebarItemProps, type SidebarItemState } from "./SidebarItem"
export { SidebarSection, type SidebarSectionProps } from "./SidebarSection"
export { SidebarFooter } from "./SidebarFooter"

export { Topbar, type TopbarProps } from "./Topbar"
export { TopbarSearch, type TopbarSearchProps } from "./TopbarSearch"
export { UserMenu, type UserMenuItem, type UserMenuProps } from "./UserMenu"

export { Breadcrumb, type BreadcrumbItem, type BreadcrumbProps } from "./Breadcrumb"
export { Pagination, type PaginationProps } from "./Pagination"
