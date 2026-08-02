"""
MCP Tool Registry for discovering and managing Cortex tools exposed to external AI clients.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable

from src.mcp.domain.exceptions import ToolExecutionDenied


@dataclass(frozen=True, slots=True)
class MCPToolDefinition:
    """Definition and schema of an MCP Tool."""

    name: str
    description: str
    input_schema: dict[str, Any]
    output_schema: dict[str, Any] = field(default_factory=lambda: {"type": "object"})
    category: str = "general"
    required_roles: tuple[str, ...] = ("owner", "admin", "member")


class MCPToolRegistry:
    """Registry maintaining tools exposed over the Model Context Protocol."""

    def __init__(self) -> None:
        self._tools: dict[str, MCPToolDefinition] = {}
        self._register_default_cortex_tools()

    def _register_default_cortex_tools(self) -> None:
        """Register the built-in Cortex tools specified in the V8 blueprint."""

        # 1. search_documents
        self.register(
            MCPToolDefinition(
                name="search_documents",
                description="Search tenant knowledge base chunks using hybrid vector and full-text search.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query text"},
                        "limit": {"type": "integer", "default": 5, "description": "Max result count"},
                    },
                    "required": ["query"],
                },
                category="knowledge",
            )
        )

        # 2. retrieve_context
        self.register(
            MCPToolDefinition(
                name="retrieve_context",
                description="Perform hybrid RAG retrieval combining vector search chunks and prioritised Knowledge Graph facts.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Question or prompt requiring context"},
                        "limit": {"type": "integer", "default": 5, "description": "Top K context items"},
                    },
                    "required": ["query"],
                },
                category="retrieval",
            )
        )

        # 3. graph_search
        self.register(
            MCPToolDefinition(
                name="graph_search",
                description="Search Knowledge Graph entities and relationships for a query or specific entity.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Entity or relationship query string"},
                        "entity_id": {"type": "string", "description": "Optional specific entity UUID"},
                    },
                    "required": ["query"],
                },
                category="knowledge_graph",
            )
        )

        # 4. run_agent
        self.register(
            MCPToolDefinition(
                name="run_agent",
                description="Trigger execution of an internal Cortex agent for a goal message.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "agent_id": {"type": "string", "description": "Target Agent UUID"},
                        "message": {"type": "string", "description": "User message / goal"},
                    },
                    "required": ["agent_id", "message"],
                },
                category="agent",
            )
        )

        # 5. list_documents
        self.register(
            MCPToolDefinition(
                name="list_documents",
                description="List uploaded knowledge documents for the tenant.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "default": 20, "description": "Page limit"},
                        "offset": {"type": "integer", "default": 0, "description": "Page offset"},
                    },
                },
                category="knowledge",
            )
        )

        # 6. upload_document
        self.register(
            MCPToolDefinition(
                name="upload_document",
                description="Upload and ingest a new text document into tenant knowledge base.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Document title"},
                        "content": {"type": "string", "description": "Document text content"},
                    },
                    "required": ["title", "content"],
                },
                category="knowledge",
                required_roles=("owner", "admin"),
            )
        )

        # 7. query_memory
        self.register(
            MCPToolDefinition(
                name="query_memory",
                description="Query agent execution history and memory steps for a run.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "run_id": {"type": "string", "description": "Agent Run UUID"},
                    },
                    "required": ["run_id"],
                },
                category="agent",
            )
        )

    def register(self, tool: MCPToolDefinition) -> None:
        """Register a new tool."""
        self._tools[tool.name] = tool

    def get(self, name: str) -> MCPToolDefinition:
        """Get a tool definition by name."""
        if name not in self._tools:
            raise ToolExecutionDenied(message=f"Tool '{name}' is not registered", data={"tool_name": name})
        return self._tools[name]

    def list_tools(self, user_role: str = "member") -> list[dict[str, Any]]:
        """List all tools accessible to the given role."""
        out: list[dict[str, Any]] = []
        for tool in self._tools.values():
            if user_role in tool.required_roles or "member" in tool.required_roles:
                out.append(
                    {
                        "name": tool.name,
                        "description": tool.description,
                        "inputSchema": tool.input_schema,
                    }
                )
        return out


__all__ = ["MCPToolDefinition", "MCPToolRegistry"]
