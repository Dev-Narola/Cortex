"""
Cortex MCP Python SDK Client — programmatic access to Cortex tools, resources, and RAG.
"""

from __future__ import annotations

import json
import urllib.request
from typing import Any


class CortexMCPClient:
    """Client for communicating with the Cortex MCP server over HTTP JSON-RPC 2.0."""

    def __init__(self, endpoint_url: str, api_key: str) -> None:
        self.endpoint_url = endpoint_url.rstrip("/")
        self.api_key = api_key
        self._request_id = 0

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    def _send_rpc(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": method,
            "params": params or {},
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            self.endpoint_url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "X-API-Key": self.api_key,
            },
            method="POST",
        )
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            if not body:
                return {}
            res = json.loads(body)
            if "error" in res and res["error"]:
                raise RuntimeError(f"MCP RPC Error [{res['error'].get('code')}]: {res['error'].get('message')}")
            return res.get("result", {})

    def ping(self) -> dict[str, Any]:
        """Ping the Cortex MCP server."""
        return self._send_rpc("ping")

    def list_tools(self) -> list[dict[str, Any]]:
        """Discover tools exposed by Cortex."""
        res = self._send_rpc("tools/list")
        return res.get("tools", [])

    def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Execute a tool on Cortex."""
        return self._send_rpc("tools/call", {"name": name, "arguments": arguments})

    def list_resources(self) -> list[dict[str, Any]]:
        """List data resources exposed by Cortex."""
        res = self._send_rpc("resources/list")
        return res.get("resources", [])

    def read_resource(self, uri: str) -> dict[str, Any]:
        """Read a data resource from Cortex."""
        res = self._send_rpc("resources/read", {"uri": uri})
        contents = res.get("contents", [])
        return contents[0] if contents else {}

    def list_prompts(self) -> list[dict[str, Any]]:
        """List prompt templates exposed by Cortex."""
        res = self._send_rpc("prompts/list")
        return res.get("prompts", [])

    def get_prompt(self, name: str, arguments: dict[str, str]) -> dict[str, Any]:
        """Render a prompt template."""
        return self._send_rpc("prompts/get", {"name": name, "arguments": arguments})
