# Runbook — Object Storage Failure

V9 Part 3, Task 37.

## Detection

* Document upload returns 500
* `/health/ready` reports `unhealthy` for object
  storage
* The download endpoint returns timeouts

## Immediate response

1. Check the S3 console for the bucket status.
2. If the bucket is unreachable, the application
   retries with exponential backoff (V9 Part 2
   Task 23).
3. If the bucket is in a different region, the
   application fails over to the cross-region replica.
4. If the bucket is corrupted, restore from the
   most recent backup.

## Escalation

* If the outage lasts > 15 min, escalate to the
  platform team and the cloud provider.
* If customer data is at risk, escalate to the
  security team.

## Recovery

1. Verify the bucket is healthy.
2. Update the S3 endpoint in the secret store.
3. Restart the API instances.
4. Replay the failed uploads (the application stores
   the source-of-truth in Postgres first; the object
   is uploaded on a background task).

## Validation

* `/health/ready` reports `healthy` for object
  storage.
* The smoke test suite passes.
* The dashboard shows no spike in failed uploads.

## Post-incident review

* Record the timeline in `reports/security/postmortems/`.
* Identify the root cause.
* File a follow-up action item.
