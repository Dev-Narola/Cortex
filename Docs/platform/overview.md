# Cortex Platform Documentation

V9 Part 4, Task 47.

This directory holds the per-module platform documentation
for Cortex. Each page follows the same template:

* **Purpose** — what the module is for
* **Architecture** — how the layers fit together
* **Public interfaces** — the stable API surface
* **Configuration** — the `Settings` keys it consumes
* **Dependencies** — what it relies on (inward + outward)
* **Extension points** — how to plug a new adapter in

## Modules

| Module | Page | Description |
| --- | --- | --- |
| Architecture | `overview.md` | This page |
| Identity | `identity.md` | Tenants, users, sessions, RBAC |
| Knowledge | `knowledge.md` | Documents, chunks, embeddings |
| Retrieval | `retrieval.md` | Hybrid search + RAG |
| Knowledge Graph | `knowledge-graph.md` | Entity / relation extraction + traversal |
| Agent Framework | `agents.md` | Plans, tools, execution |
| MCP | `mcp.md` | MCP server + external agent ecosystem |
| Deployment | `deployment.md` | Docker, AWS, scaling |
| Scaling | `scaling.md` | Horizontal scaling, autoscaling |
| Security | `security.md` | OWASP, secrets, audit |
| Operations | `operations.md` | Runbooks, monitoring, DR |
