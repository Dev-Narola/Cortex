# Cortex Roadmap

V9 Part 4, Task 50.

## Released

* v0.1 — Identity & Multi-tenancy
* v0.2 — Knowledge Management
* v0.3 — RAG
* v0.4 — Platform Services
* v0.5 — Hybrid Retrieval
* v0.6 — Agent Framework
* v0.7 — Knowledge Graph
* v0.8 — MCP Server
* **v1.0 — Enterprise Hardening (this release)**

## Planned

### v1.1 — Knowledge Graph at Scale

* Switch to Neo4j for tenants > 100k entities
* Federated graph queries across regions
* Real-time graph update notifications

### v1.2 — Multi-Region Active/Active

* Read-model projection in every region
* Conflict-free replicated counters for usage
* Active-active ingestion with conflict resolution

### v1.3 — Secret Management Backends

* AWS Secrets Manager backend
* HashiCorp Vault backend
* Auto-rotation hooks for all backends

### v1.4 — Collaboration

* Multi-user document editing
* Presence + cursor
* Comment threads

### v1.5 — On-Prem Deployment

* Single-binary deployment
* Air-gapped install
* License + activation flow

### v2.0 — Reasoning

* Multi-step planning
* Tool marketplace
* Adaptive retrieval (decide between BM25 / vector / graph)

## How to influence the roadmap

* Open an issue with the `roadmap` label
* Add a +1 reaction to existing issues
* Join the monthly community call (see README)
