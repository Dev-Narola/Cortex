# Architecture Debt — V1–V8 Cross-Layer Imports

V9 Part 4, Task 45.

The strict hexagonal layer-boundary rule is:

* `domain` → nothing else in the same context
* `application` → `domain`
* `infrastructure` → `application`, `domain`
* `interface` → `application`, `domain`, `infrastructure`

The V1–V8 codebase predates the strict rule. The V9
architecture validator (`scripts/architecture_check.py`)
asserts the rule for the **new V9 modules** only
(`src/platform/`, `src/read_models/`); the pre-existing
V1–V8 contexts have known cross-layer imports that are
tracked below and will be cleaned up incrementally.

## Inventory

| Context | File | Violation | Plan |
| --- | --- | --- | --- |
| `identity` | `application/auth_service.py` | imports `infrastructure/security` | Move to interface; refactor to a port |
| `identity` | `application/audit_service.py` | imports `infrastructure/audit_repository` | Inject the repository via the constructor |
| `conversation` | `application/memory_service.py` | imports `infrastructure/redis_client` | Inject via DI |
| `agents` | `application/executor.py` | imports `infrastructure/llm_provider` | Inject via DI |
| `tools` | `application/registry.py` | imports `infrastructure/models` | Inject via DI |
| `execution` | `application/agent_loop.py` | imports `infrastructure/...` | Inject via DI |
| `mcp` | `application/tool_executor.py` | imports `infrastructure/...` | Inject via DI |
| `embedding` | `application/embedder.py` | imports `infrastructure/openai_client` | Inject via DI |
| `ingestion` | `application/chunker.py` | imports `infrastructure/...` | Inject via DI |
| `observability` | `application/audit_service.py` | imports `infrastructure/metrics` | Inject the metrics client |
| `retrieval` | `application/search_service.py` | imports `infrastructure/...` | This is the V9 backward-compat shim; tracked |
| `knowledge_graph` | `application/extraction.py` | imports `infrastructure/...` | Inject via DI |

## Cross-context cycles

The V1–V8 codebase has a few cross-context import cycles
that are intentional (the contexts are tightly coupled in
the original design). They are tracked below and will be
broken in v1.1+.

| Cycle | Plan |
| --- | --- |
| `execution` → `agents` → `execution` | Extract the shared port to `core/` |
| `identity` → `observability` → `identity` | Break with an event-driven handoff |
| `identity` → `observability` → `billing` → `identity` | Same |
| `embedding` → `ingestion` → `embedding` | Extract the embedding port to `core/` |
| `ingestion` → `knowledge_graph` → `ingestion` | Domain event for the handoff |
| `agents` → `graph_retrieval` → ... | Acceptable in v1.0.0; revisit in v1.1 |

## Plan

1. **v1.0.0** — ship as-is; the new V9 modules obey the
   rule; the debt is documented.
2. **v1.1** — refactor `identity/application/audit_service.py`
   and `observability/application/audit_service.py` to use
   constructor injection.
3. **v1.2** — refactor the remaining 8 files in the
   inventory above.
4. **v1.3** — break the cross-context cycles by extracting
   the shared ports to `core/`.

## Why we are not blocking on this

The architecture validator fails the build only for the
new V9 modules. The pre-existing V1–V8 imports are part
of the *baseline*; blocking the release on a wholesale
refactor would delay the v1.0.0 release for weeks.

The plan above is sized to ~3 sprints of follow-up work;
each ticket is independent and can be merged without
breaking the public API.
