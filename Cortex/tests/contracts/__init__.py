"""Contract tests for Cortex interfaces.

V9 Part 4, Task 40.

These tests assert the *public* contract of every
external interface stays stable between releases:

* REST response schemas
* GraphQL schema stability
* MCP tool list + payload
* Worker event payloads

A contract test fails when a release accidentally removes a
field, renames a type, or changes a payload without an
explicit migration entry.
"""
