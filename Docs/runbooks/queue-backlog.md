# Runbook — Queue Backlog

V9 Part 3, Task 37.

## Detection

* `cortex_queue_depth{queue=...}` > 1,000 for > 5 min
* `cortex_queue_oldest_age_seconds{queue=...}` > 300 s
* The autoscaler has not reacted (check the worker
  dashboard)

## Immediate response

1. Identify the affected queue.
2. Check the worker fleet: are the workers alive?
3. If the workers are down, restart them.
4. If the workers are alive but the queue is growing,
   add more workers (see `docs/scaling/workers.md`).
5. Check for poison messages: any job that fails
   repeatedly is in the dead-letter queue.

## Escalation

* If the backlog is on the `embedding` or
  `graph_extraction` queue, the LLM provider is
  likely rate-limiting. Contact the provider.
* If the backlog is on `agent_execution`, the LLM
  cost cap may have been hit.

## Recovery

1. Add worker processes per the autoscaler rules.
2. Drain the dead-letter queue.
3. Verify the queue depth returns to the target.

## Validation

* Queue depth < 100 for 5 min.
* Oldest job age < 60 s.
* The smoke test suite passes.

## Post-incident review

* Record the timeline in `reports/security/postmortems/`.
* Identify the root cause.
* File a follow-up action item.
