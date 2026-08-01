# Dependency Governance

V9 Part 4, Task 44.

Cortex depends on a small, deliberately-curated set of
external libraries. This document is the source of truth
for the *current* inventory and the *process* by which
new dependencies are introduced.

## Inventory

The complete inventory lives in `pyproject.toml`. The
table below is the short-list of direct dependencies
that every PR must keep in mind.

| Package | Min version | License | Used by | Notes |
| --- | --- | --- | --- | --- |
| `fastapi` | 0.110 | MIT | API | |
| `uvicorn` | 0.27 | BSD | API | |
| `pydantic` | 2.6 | MIT | Validation | |
| `pydantic-settings` | 2.2 | MIT | Config | |
| `sqlalchemy` | 2.0 | MIT | ORM | |
| `alembic` | 1.13 | MIT | Migrations | |
| `asyncpg` | 0.29 | Apache-2.0 | Postgres async driver | |
| `psycopg` | 3.1 | LGPL | Postgres sync driver | |
| `pgvector` | 0.3 | MIT | Vector column type | |
| `redis` | 5.0 | MIT | Redis client | |
| `arq` | 0.25 | MIT | Background worker | |
| `strawberry-graphql` | 0.223 | MIT | GraphQL | |
| `openai` | 1.30 | Apache-2.0 | LLM provider | |
| `httpx` | 0.27 | BSD | HTTP client | |
| `cryptography` | 42.0 | Apache-2.0 | JWT signing | |
| `passlib` | 1.7 | BSD | Password hashing | |
| `bcrypt` | 4.1 | Apache-2.0 | Password hashing | |
| `python-jose` | 3.3 | MIT | JWT | |
| `tenacity` | 8.2 | Apache-2.0 | (optional) retry | |
| `prometheus-client` | 0.20 | Apache-2.0 | Metrics | |
| `opentelemetry-api` | 1.24 | Apache-2.0 | Tracing | |
| `opentelemetry-sdk` | 1.24 | Apache-2.0 | Tracing | |
| `langchain` | (optional) | MIT | LLM orchestration | |
| `pytest` | 8.0 | MIT | Testing | |
| `pytest-asyncio` | 0.23 | Apache-2.0 | Testing | |
| `fakeredis` | 2.21 | MIT | Testing | |
| `ruff` | 0.4 | MIT | Lint | |
| `mypy` | 1.10 | MIT | Type check | |

## Process for adding a dependency

1. Open a PR adding the package to `pyproject.toml`.
2. The PR description must include:
   * Why the dependency is needed
   * Why an existing dependency cannot solve the problem
   * License compatibility (must be MIT / BSD / Apache-2.0)
   * Security advisory lookup (`pip-audit` clean)
   * Maintenance status (last commit within 12 months)
3. The architecture validator confirms the dependency
   is only imported in `infrastructure` or `interface`.
4. The CI gate runs `pip-audit` to flag known CVEs.
5. Two reviewers must approve.

## Process for upgrading a dependency

1. Open a PR bumping the version in `pyproject.toml`.
2. Run the full test suite locally.
3. The CI gate runs `pytest` + `pip-audit`.
4. Two reviewers must approve major version bumps;
   minor / patch bumps need one reviewer.

## Process for retiring a dependency

1. Open a PR removing the package from `pyproject.toml`
   and all imports.
2. The CI gate confirms no remaining references.
3. The release notes mention the removal.

## Scheduled review

The dependency review is performed **quarterly** (every
three months) by the platform team. The review:

* Runs `pip-audit` against the production requirements
* Checks for deprecations on the official tracker
* Flags any dependency that has not seen a release in
  12+ months
* Updates the inventory table above

## License policy

Cortex may use packages with the following licenses:

* MIT
* BSD (2-clause and 3-clause)
* Apache-2.0
* PSF
* ISC

GPL, AGPL, LGPL, and any commercial license require an
explicit exception approved by the platform team.
