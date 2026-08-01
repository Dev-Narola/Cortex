# Runbook — Redis Failure

V9 Part 3, Task 37.

## Detection

* `cortex_redis_up == 0` for > 30 s
* `/health/ready` reports `unhealthy` for Redis
* Rate limiter and cache reads are slow

## Immediate response

1. Check the Redis cluster status: `redis-cli -h ... cluster info`.
2. If the primary is down, the Sentinel will promote a
   replica within 30 s.
3. If the Sentinel is also down, manually promote:
   `redis-cli -h ... CLUSTER FAILOVER FORCE`.
4. The application reconnects automatically.

## Escalation

* If the cluster is unrecoverable, escalate to the
  platform team lead.
* If the cluster is split-brain, escalate to the
  security team (data integrity risk).

## Recovery

1. Verify the new primary accepts writes.
2. Update the Redis connection string in the secret
   store.
3. Restart the API instances to flush the L1 cache.
4. Run the smoke test suite.

## Validation

* `/health/ready` reports `healthy` for Redis.
* The rate limiter returns to normal latency.
* The dashboard shows no spike in DB queries
  (Redis fallback increases DB load).

## Post-incident review

* Record the timeline in `reports/security/postmortems/`.
* Identify the root cause.
* File a follow-up action item.
