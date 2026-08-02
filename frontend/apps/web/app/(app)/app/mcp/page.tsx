/**
 * MCP server — `/app/mcp`.
 *
 * Tool registry + active session list. The session token is
 * shown once and only once (after the user generates it); we
 * never persist it client-side.
 */
export default function McpPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        MCP server
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Expose your knowledge base to external agents over the Model
        Context Protocol.
      </p>
    </div>
  );
}
