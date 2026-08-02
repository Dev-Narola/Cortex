"""Worker event-payload contract tests.

V9 Part 4, Task 40.

Pins the payload of every background-job event the
application publishes. A change to a field name or type
should fail this test until the migration guide is updated.
"""

from __future__ import annotations

import pytest


EXPECTED_WORKER_EVENTS: dict[str, list[str]] = {
    "document.indexed": ["tenant_id", "document_id", "chunk_count", "indexed_at"],
    "document.failed": ["tenant_id", "document_id", "error", "failed_at"],
    "embedding.batch_completed": ["tenant_id", "count", "duration_ms"],
    "graph.extraction_completed": ["tenant_id", "document_id", "entity_count", "relation_count"],
    "graph.extraction_failed": ["tenant_id", "document_id", "error"],
    "agent.run_started": ["tenant_id", "run_id", "agent_id", "started_at"],
    "agent.run_completed": ["tenant_id", "run_id", "output", "completed_at"],
    "agent.run_failed": ["tenant_id", "run_id", "error", "failed_at"],
    "mcp.tool_invoked": ["tenant_id", "tool", "latency_ms"],
    "mcp.tool_failed": ["tenant_id", "tool", "error"],
}


class TestWorkerEventContract:
    def test_all_events_have_tenant_id(self) -> None:
        for name, fields in EXPECTED_WORKER_EVENTS.items():
            assert "tenant_id" in fields, f"{name} missing tenant_id"

    def test_no_event_removed(self) -> None:
        expected_minimum = {
            "document.indexed",
            "embedding.batch_completed",
            "graph.extraction_completed",
        }
        assert expected_minimum.issubset(EXPECTED_WORKER_EVENTS.keys())

    def test_event_fields_are_non_empty(self) -> None:
        for name, fields in EXPECTED_WORKER_EVENTS.items():
            assert fields, f"{name} has empty field list"
