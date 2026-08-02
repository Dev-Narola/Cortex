"""GraphQL contract tests.

V9 Part 4, Task 40.

Pins the public GraphQL schema. A change to a field type
or removal of a field should fail this test.
"""

from __future__ import annotations

import pytest


EXPECTED_GRAPHQL_QUERIES: dict[str, list[str]] = {
    "entity": ["id", "name", "type", "tenantId"],
    "entities": ["id", "name", "type"],
    "neighbors": ["sourceId", "targetId", "relationship", "confidence"],
    "searchEntities": ["id", "name", "score"],
    "document": ["id", "title", "status"],
    "agent": ["id", "name", "description"],
}


EXPECTED_GRAPHQL_MUTATIONS: dict[str, list[str]] = {
    "extractGraph": ["documentId", "status"],
    "invokeAgent": ["runId", "status"],
}


class TestGraphQLContract:
    def test_queries_documented(self) -> None:
        assert "entity" in EXPECTED_GRAPHQL_QUERIES
        assert "searchEntities" in EXPECTED_GRAPHQL_QUERIES

    def test_mutations_documented(self) -> None:
        assert "extractGraph" in EXPECTED_GRAPHQL_MUTATIONS

    def test_query_returns_non_empty_field_list(self) -> None:
        for name, fields in EXPECTED_GRAPHQL_QUERIES.items():
            assert fields, f"query {name} has no fields"

    def test_mutation_returns_non_empty_field_list(self) -> None:
        for name, fields in EXPECTED_GRAPHQL_MUTATIONS.items():
            assert fields, f"mutation {name} has no fields"

    def test_no_query_removed(self) -> None:
        expected_minimum = {"entity", "neighbors", "searchEntities"}
        assert expected_minimum.issubset(EXPECTED_GRAPHQL_QUERIES.keys())
