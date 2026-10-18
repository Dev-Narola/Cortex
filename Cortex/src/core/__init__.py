"""Cross-cutting infrastructure: config, DB, Redis, auth deps, etc.

This package is intentionally narrow in scope. Eager imports in
``__init__`` are deliberately avoided so the dependency graph stays
explicit: callers should import from the specific submodule they
need (``from src.core.config import settings``) rather than
``from src.core import settings``.
"""

from __future__ import annotations

__all__: list[str] = []
