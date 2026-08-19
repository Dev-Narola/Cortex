/**
 * Knowledge Graph — `/app/graph`.
 *
 * **F6 Part 2.** The route is now a thin mount
 * point for ``GraphExplorer``. The explorer
 * owns the data flow (search → entity fetch →
 * relations fetch → graph), so this page no
 * longer passes the demo dataset. The
 * explorer handles the empty state when no
 * search is active.
 *
 * **Server entry.** The page is a server
 * component so Next.js doesn't try to pre-render
 * the TanStack Query / useAuthStore calls. The
 * client work (R3F, drei, the 3D scene) lives
 * inside ``GraphExplorer`` and is loaded via
 * ``next/dynamic`` with ``ssr: false``.
 *
 * **Full-bleed.** The (app) layout adds ``p-6``
 * to the main column. We undo that with
 * ``-m-6`` on the explorer's section so the
 * canvas reaches the layout's available
 * viewport. The header is suppressed via the
 * explicit null — the explorer owns the screen.
 *
 * **Future deep-link support.** A future V9 item
 * can read ``searchParams.q`` and pass it as
 * ``defaultQuery`` to pre-fill the search bar
 * (e.g. a citation chip links to the graph).
 * Today the page is fully client-driven.
 */

import { GraphExplorer } from "@/components/graph"

export default function GraphPage() {
  return <GraphExplorer />
}
