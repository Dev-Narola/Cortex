# Runbook — MCP Service Failure

V9 Part 3, Task 37.

## Detection

* `cortex_mcp_active_sessions` drops to 0 unexpectedly
* `/health/ready` reports `unhealthy` for MCP
* MCP clients report connection failures

## Immediate response

1. Check the MCP server logs for the last error.
2. Check the WebSocket connection count.
3. If the WebSocket layer is failing, the MCP server
   falls back to HTTP.
4. If the HTTP layer is also failing, check the
   upstream API.

## Escalation

* If the MCP server is down for > 5 min, escalate to
  the platform team.
* If the issue is with a specific MCP client, contact
  the client team.

## Recovery

1. Restart the MCP server.
2. The clients reconnect automatically (the session
   state is in Redis).
3. Verify the tool registry is loaded.

## Validation

* `cortex_mcp_active_sessions` is back to the expected
  count.
* The smoke test (`tests/integration/mcp/test_handshake.py`)
  passes.
* The smoke test suite passes.

## Post-incident review

* Record the timeline in `reports/security/postmortems/`.
* Identify the root cause.
* File a follow-up action item.
