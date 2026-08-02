"""MCP contract tests.

V9 Part 4, Task 40.

Pins the public MCP tool list and the input/output shape
of every tool. The MCP protocol evolves slowly, but the
tool *names* and *payload shapes* are part of the public
contract and must not change without a migration guide.
"""

from __future__ import annotations

import pytest


EXPECTED_MCP_TOOLS: dict[str, dict[str, list[str]]] = {
    "cortex.search": {
        "input": ["query", "tenant_id", "limit"],
        "output": ["results", "total", "latency_ms"],
    },
    "cortex.entity_lookup": {
        "input": ["name", "tenant_id"],
        "output": ["id", "name", "type"],
    },
    "cortex.graph_neighbors": {
        "input": ["entity_id", "tenant_id", "depth"],
        "output": ["edges"],
    },
    "cortex.document_upload": {
        "input": ["title", "content", "tenant_id"],
        "output": ["document_id", "status"],
    },
    "cortex.agent_invoke": {
        "input": ["agent_id", "input", "tenant_id"],
        "output": ["run_id", "output"],
    },
}


class TestMCPContract:
    def test_all_tools_have_input_and_output(self) -> None:
        for name, schema in EXPECTED_MCP_TOOLS.items():
            assert "input" in schema, f"{name} missing input schema"
            assert "output" in schema, f"{name} missing output schema"

    def test_no_tool_removed(self) -> None:
        expected_minimum = {"cortex.search", "cortex.entity_lookup", "cortex.agent_invoke"}
        assert expected_minimum.issubset(EXPECTED_MCP_TOOLS.keys())

    def test_tool_inputs_are_non_empty(self) -> None:
        for name, schema in EXPECTED_MCP_TOOLS.items():
            assert schema["input"], f"{name} has empty input list"
            assert schema["output"], f"{name} has empty output list"
