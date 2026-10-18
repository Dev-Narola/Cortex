import { redirect } from "next/navigation"

// The MCP overview lives under Settings; keep the old URL working.
export default function McpPage() {
  redirect("/app/settings/mcp")
}
