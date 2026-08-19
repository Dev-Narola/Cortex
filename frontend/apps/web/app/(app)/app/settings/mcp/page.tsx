/**
 * MCP — `/app/settings/mcp`.
 *
 * **F7 Part 3 (Task 4).** Thin route that
 * mounts `<McpPanel />` — same pattern as
 * the F7 Part 1 + Part 2 settings pages.
 */
import { McpPanel } from "@/components/settings/mcp/mcp-panel"

export default function McpPage() {
  return <McpPanel />
}
