/**
 * API Keys — `/app/settings/api-keys`.
 *
 * **F7 Part 2 (Task 2).** The route is a thin
 * mount for `<ApiKeysPanel />` — same pattern
 * as the F7 Part 1 team route. The panel owns
 * the entire screen surface (header + list +
 * modals + states).
 */
import { ApiKeysPanel } from "@/components/settings/api-keys/api-keys-panel"

export default function ApiKeysPage() {
  return <ApiKeysPanel />
}
