# Known Limitations — v1.0.0

V9 Part 4, Task 50.

This document tracks limitations of the v1.0.0 release
that the engineering team is aware of. The list is
reviewed at every release; resolved items are removed.

## Knowledge Graph

1. **Postgres backend** — the V7 implementation runs the
   knowledge graph on Postgres (per ADR-0004). Neo4j is
   a forward-compat seam only; the production deployment
   uses the recursive CTE on `kg_relations`.
2. **Extraction LLM cost** — graph extraction is the
   most expensive part of the pipeline. The default
   rate limit is 50 chunks per minute per tenant.

## MCP Server

1. **Session affinity** — long-lived MCP sessions are
   stored in Redis. A multi-region deployment requires
   Redis replication.
2. **Tool payload size** — capped at 1 MB. Larger
   payloads must be uploaded to S3 and referenced by
   URL.

## Multi-Region

1. **Active/passive only** — only one region is active;
   the secondary is warm. Active/active is on the
   roadmap (v1.2).
2. **Database replication** — the read-replica lag is
   up to 5 seconds. Read-your-writes is not guaranteed
   for the cross-region reader.

## Observability

1. **Distributed tracing** — only the API surface is
   traced end-to-end. Worker spans are emitted but
   not yet stitched to the parent API request.
2. **Metrics cardinality** — labels are kept under 50
   unique values per metric to avoid Prometheus
   cardinality issues.

## Security

1. **AWS Secrets Manager** — not wired (forward-compat
   seam in `SecretProvider`).
2. **Vault** — not wired.
3. **mTLS** — not enforced at the API edge; the ALB
   is expected to terminate TLS.

## Operations

1. **Multi-AZ failover** — the failover controller
   promotes a replica in < 2 min. Manual intervention
   may be required for region-wide events.
2. **Backup encryption** — the KMS key is rotated
   quarterly; older backups use the previous key.

## Test Suite

1. **Performance baselines** — the first release's
   baselines are placeholders. Real baselines are
   recorded after 7 days of production traffic.
2. **Chaos in production** — the chaos test suite
   runs in CI and against a staging environment. A
   production chaos-drill cadence is on the roadmap
   (v1.2).
