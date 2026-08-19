/**
 * Knowledge Graph — `/app/graph`.
 *
 * **F6 Part 1.** The thin server entry that
 * mounts the graph explorer. The route is
 * intentionally minimal:
 *
 *   - The page is a server component (no
 *     "use client" at the top) so Next.js can
 *     pre-render the shell + the loading
 *     boundary without trying to load three.js
 *     on the server.
 *   - The heavy client work (R3F, drei, the
 *     3D scene) lives inside ``GraphExplorer``
 *     and is loaded via ``next/dynamic`` with
 *     ``ssr: false``. The chunk ships only
 *     when the user visits this route.
 *   - The data is the demo dataset for Part 1.
 *     Part 2 swaps this for the API adapter.
 *
 * **No business logic.** No fetch, no state,
 * no error handling — the explorer handles the
 * data + the search/selection state. The
 * route's job is "render the explorer with the
 * data it needs".
 *
 * **Full-bleed.** The (app) layout adds ``p-6``
 * to the main column. We undo that with
 * ``-m-6`` on the explorer's section so the
 * canvas reaches the layout's available
 * viewport. The header is suppressed via the
 * explicit null — the explorer owns the
 * screen.
 */

import { DEMO_GRAPH, GraphExplorer } from "@/components/graph"

export default function GraphPage() {
  return <GraphExplorer data={DEMO_GRAPH} />
}
