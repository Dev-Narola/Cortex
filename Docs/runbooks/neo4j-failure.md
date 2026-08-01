# Runbook — Neo4j Failure

V9 Part 3, Task 37. *Note: the V7 implementation runs the
knowledge graph on Postgres; this runbook covers the
forward-compat Neo4j deployment.*

## Detection

* `cortex_neo4j_up == 0` for > 30 s
* `/health/ready` reports `unhealthy` for Neo4j
* Graph traversal latency spikes

## Immediate response

1. Check the Neo4j cluster status: `cypher-shell -a ... CALL dbms.cluster.status()`.
2. If a leader is lost, the cluster elects a new leader
   automatically; verify the new leader is reachable.
3. If a database is corrupted, fail writes over to the
   read replica and run `neo4j-admin check-consistency`.
4. The application falls back to a SQL-only traversal
   path while Neo4j is down (the recursive CTE on
   `kg_relations` is the V7 fallback).

## Escalation

* If the cluster cannot elect a leader, escalate to the
  platform team lead.
* If data corruption is confirmed, escalate to the
  database team and start the recovery procedure from
  `docs/recovery/disaster-recovery.md`.

## Recovery

1. Verify the cluster is healthy.
2. Update the Neo4j connection string in the secret
   store.
3. Restart the API instances.
4. Replay the failed graph extractions.

## Validation

* `/health/ready` reports `healthy` for Neo4j.
* Graph traversal latency returns to baseline.
* The smoke test suite passes.

## Post-incident review

* Record the timeline in `reports/security/postmortems/`.
* Identify the root cause.
* File a follow-up action item.
