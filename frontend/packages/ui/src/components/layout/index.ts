/**
 * Layout — barrel for chrome primitives: separators, spacers,
 * containers, grids, pages, sections.
 *
 * Re-exported by `@cortex/ui`; never imported directly by app code.
 *
 * **F1 Part 4 (Task 36).** Page composition primitives.
 * The full set:
 *   - `Page` / `PageHeader` / `PageContent`
 *   - `Section`
 *   - `Container`
 *   - `Grid`
 *   - `Separator` (from Part 2)
 *
 * **Composition.**
 *
 *   <Page size="md">
 *     <PageHeader title="Settings" breadcrumb={...} actions={...} />
 *     <PageContent>
 *       <Section title="Profile">
 *         <Card>...</Card>
 *       </Section>
 *     </PageContent>
 *   </Page>
 *
 * **No business logic.** Layout components are visual
 * only; the page composes the Sidebar, Topbar, and
 * content slots. Routing is the app layer's job.
 */

export { Separator } from "./Separator"
export { type ContainerProps, type ContainerSize, Container } from "./Container"
export {
  type GridProps,
  type GridColumns,
  type GridGap,
  type ResponsiveColumns,
  Grid,
} from "./Grid"
export { type PageProps, type PageSize, Page } from "./Page"
export { type PageContentProps, PageContent } from "./PageContent"
export { type PageHeaderProps, PageHeader } from "./PageHeader"
export { type SectionProps, Section } from "./Section"
