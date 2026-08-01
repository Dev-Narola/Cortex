# Code Quality Standards

V9 Part 4, Task 46.

This document defines the standards every PR must meet
before it can be merged. The CI quality gate enforces the
machine-checkable rules; the human-checkable rules are
applied by reviewers.

## Naming conventions

| Element | Convention | Example |
| --- | --- | --- |
| Module | `snake_case` | `document_service.py` |
| Class | `PascalCase` | `DocumentService` |
| Function / method | `snake_case` | `create_document()` |
| Variable | `snake_case` | `document_id` |
| Constant | `UPPER_SNAKE_CASE` | `MAX_UPLOAD_BYTES` |
| Type alias | `PascalCase` | `DocumentId` |
| Exception | `PascalCase`, suffix `Error` or `Exception` | `DocumentNotFoundError` |
| Test | `test_<unit>.py` | `test_document_service.py` |

## Module organisation

* Every bounded context follows the hexagonal layout:
  `domain`, `application`, `infrastructure`, `interface`.
* Eager imports in `__init__.py` are avoided; callers
  import from the specific submodule.
* The `application` layer never imports from
  `infrastructure` or `interface` (enforced by
  `scripts/architecture_check.py`).
* `domain` modules have **no** outbound imports to
  `application`, `infrastructure`, or `interface`.

## Error handling

* Raise domain-specific exceptions, not generic
  `Exception` or `RuntimeError`.
* Catch exceptions at the boundary; never swallow them
  silently.
* Re-raise with `from` to preserve the cause.
* All user-facing errors are mapped to the
  `shared.exceptions` hierarchy.

## Logging

* Use the structured logger from
  `core.logging.get_logger(__name__)`.
* Every log line includes `tenant_id`, `request_id`, and
  the relevant entity id.
* Log levels:
  * `DEBUG` — internal state, expensive to compute
  * `INFO` — significant business events
  * `WARNING` — recoverable anomalies
  * `ERROR` — failures the operator should see
  * `CRITICAL` — failures the on-call should see
* **Never** log secrets, JWTs, or PII.

## Testing expectations

* Every new feature ships with unit tests covering the
  happy path + at least one sad path.
* Every new public function has a test that documents
  the expected behaviour.
* Tests are deterministic — no `time.sleep`, no random
  seeds without a fixed seed, no reliance on
  wall-clock time.
* Tests use the fixtures under `tests/conftest.py`.
* The CI gate enforces 65% minimum total coverage and
  per-package floors where configured.

## Documentation requirements

* Every public class / function has a docstring
  describing the *intent*, not the implementation.
* Every bounded context has a `Docs/<context>.md`
  page that mirrors the public surface.
* Breaking changes require an ADR under `Docs/adr/`.
* New public configuration keys go in the
  `Settings` class and the corresponding section in
  `Docs/configuration.md`.

## Review checklist

Every PR must satisfy the following before approval:

- [ ] Tests added or updated
- [ ] No new lint or type errors (`ruff`, `mypy`)
- [ ] No new coverage drop
- [ ] Public surface documented (docstring + Docs/)
- [ ] No new dependency without governance review
- [ ] Architecture validator passes
- [ ] Migration added for any schema change
- [ ] Release notes entry added for user-facing change
- [ ] At least one reviewer approves
- [ ] CI gate is green
