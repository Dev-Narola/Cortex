# Upgrade Guide

V9 Part 4, Task 50.

## From v0.9.x to v1.0.0

### Pre-flight

1. Snapshot the database (`pg_dump --schema-only`).
2. Stop the API and workers.
3. Verify the snapshot completed.

### Migration

```bash
git fetch --tags
git checkout v1.0.0
pip install -e .[dev]
alembic upgrade head
```

### Restart

```bash
systemctl restart cortex-api
systemctl restart cortex-worker
```

### Validation

```bash
pytest tests/integration -m smoke
curl -f http://localhost:8000/health/ready
```

### Breaking changes

* `Settings.ENABLE_QUERY_SERVICES` defaults to `True`.
  If you have a custom fork that depends on the
  unified command/query service, set it to `False`.
* `Settings.ENABLE_READ_MODELS` defaults to `True`.
  Same caveat.
* The `Platform.dependencies` module reorganised; the
  old import paths still work via the backward-compat
  shim under `src/retrieval/application/search_service.py`.

### Rollback

If something goes wrong, follow `Docs/operations/rollback.md`
to roll back to v0.9.x.
