# Database Migration Runbook

V9 Part 4, Task 48.

## Pre-flight

* Read the migration file end-to-end.
* Check for `op.execute()` calls that may not be
  reversible.
* Check for `ALTER TABLE` on a large table (lock time).
* Verify the migration has a working `downgrade()`.

## Staging

1. Deploy the new code to staging.
2. Run `alembic upgrade head`.
3. Run the smoke test suite.
4. Verify no new errors in the logs.

## Production

1. Schedule the migration window.
2. Notify the on-call team.
3. Run `alembic upgrade head` against the primary.
4. Verify the schema:
   ```sql
   SELECT version_num FROM alembic_version;
   ```
5. Deploy the new code.
6. Run the post-deploy smoke test.
7. Monitor for 30 min.

## Rollback

```bash
alembic downgrade -1
```

Then roll back the code per `rollback.md`.

## Lock-heavy migrations

For `ALTER TABLE` on a table > 10M rows, use
`ALTER TABLE ... ADD COLUMN ... DEFAULT ...` with a
two-step deployment:

1. Add the column without the default.
2. Backfill in batches.
3. Add the default.

The migration script under `scripts/migrate.sh` automates
this for known tables.
