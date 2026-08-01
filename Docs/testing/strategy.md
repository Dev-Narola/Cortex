# Cortex Test Strategy

V9 Part 4, Task 39.

This document defines the testing pyramid for Cortex and
the coverage targets per layer. It is the single source of
truth that the CI quality gates (V9 Part 4, Task 42) and the
architecture validator (V9 Part 4, Task 45) enforce.

## Pyramid

```text
        /\
       /  \         E2E tests
      /----\        (slow, narrow)
     /      \
    / Contract\     Contract tests
   /   Tests   \    (REST / GraphQL / MCP / SDK / Workers)
  /------------\
 /              \
/ Performance +  \  Performance + Chaos
\  Chaos Tests  /   (baseline + load)
 \------------/
 /              \
/ Integration     \ Integration tests
\    Tests      /   (DB, Redis, MCP, KG)
 \------------/
 /              \
/  Unit Tests    \ Unit tests
\              /   (domain, application, infrastructure)
 \------------/
```

## Per-layer coverage targets

| Layer | Target | Notes |
| --- | --- | --- |
| Domain | 95%+ | Pure logic; easy to cover |
| Application | 90%+ | Service orchestration |
| Infrastructure | 80%+ | Adapter logic; some DB drivers hard to test |
| API | 90%+ | Route + dependency wiring |
| Interface (REST / GraphQL / MCP) | 90%+ | Contract tests complement |

Coverage is enforced at the *total* level (`fail_under`)
and per-package (`fail_under_per_package`) in
`pyproject.toml`.

## What each layer tests

### Unit tests (`tests/unit/`)

* Domain entity invariants and factory validation
* Application service orchestration with mocked repositories
* Value object comparisons and serialisation
* Pure platform logic (resilience, cache, lock, projection)

### Integration tests (`tests/integration/`)

* Postgres + SQLAlchemy against an in-memory SQLite / real PG
* Redis against `fakeredis`
* Knowledge graph end-to-end (entity + relation persistence)
* MCP handshake + tool invocation

### Contract tests (`tests/contracts/`)

* REST response schema is stable
* GraphQL schema is stable
* MCP tool list is stable
* Worker event payloads are stable

### Performance tests (`tests/performance/`)

* Search, retrieval, agent execution, MCP, KG, memory
* Compare against the previous release
* Reject the release on > 15% regression

### Chaos tests (`tests/chaos/`)

* Database outage / slow / read-only / exhausted
* Redis / LLM / object storage / queue outage
* Network latency / packet loss / DNS failure

### Architecture tests (`tests/architecture/`)

* Layer boundaries (domain → application → infrastructure)
* No circular imports
* Hexagonal dependency direction
* No application service imports from `interface/`

## Test data management

* Unit + integration tests use a fresh SQLite in-memory
  database per test (via the `db_session` fixture).
* Performance tests seed 100k documents + 5M chunks from
  the seed script under `benchmarks/datasets/`.
* Chaos tests use a fault-injection abstraction
  (`tests/chaos/faults.py`).

## Continuous validation

* Every PR runs unit + integration + contract + architecture
  + a smoke benchmark.
* Nightly runs add the full performance + chaos suite.
* Release runs add the load tests + DR validation.

## Reviewing test quality

A "covered line" is not a goal in itself — meaningful
behaviour coverage is. The test quality checklist is in
`docs/governance/code-quality.md` (Task 46).
