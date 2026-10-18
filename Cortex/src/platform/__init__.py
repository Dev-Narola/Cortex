"""Cross-cutting platform services.

V9 introduced the ``src/platform/`` package as a home for
services that span every bounded context:

* ``projections`` — read-model refresh engine (V9 Part 1 Task 7)
* ``locking`` — distributed locking (V9 Part 2 Task 15)
* ``cache`` — multi-level cache + invalidation (V9 Part 2 Task 17)
* ``resilience`` — retry + circuit breaker + fallback (V9 Part 2 Task 23)
* ``security`` — HTTP hardening + audit hooks (V9 Part 3 Task 28)
* ``secrets`` — secret provider + rotation (V9 Part 3 Task 29)
* ``read_models`` package lives in ``src/read_models/`` to mirror
  the bounded-context layer; only the *projections engine* is
  here because it's a platform concern.

Eager imports are deliberately avoided; import from the
specific submodule (``from src.platform.projections import
ProjectionService``) so the dependency graph stays explicit.
"""

from __future__ import annotations

__all__: list[str] = []
