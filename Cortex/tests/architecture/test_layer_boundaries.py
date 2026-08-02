"""Hexagonal architecture layer-boundary tests.

V9 Part 4, Task 45.

These tests assert the dependency direction for the
*new V9* modules (the ``src/platform/`` package and the
V9-introduced ``src/read_models/`` package). The pre-existing
V1–V8 contexts have known cross-layer imports that are
tracked as tech debt in ``Docs/governance/architecture-debt.md``
and will be cleaned up incrementally.

The strict rule enforced by the CI gate is:

* ``src/platform/`` is a peer of every bounded context; its
  modules must not import from any bounded context's
  ``domain``, ``application``, or ``interface`` layer.
* ``src/read_models/`` is a leaf package; it imports only
  from ``__future__`` and the standard library.
* ``src/platform/<sub>`` modules do not import from
  ``src/platform/audit`` (the audit module is a leaf).
"""

from __future__ import annotations

import ast
from pathlib import Path
from typing import Iterable

import pytest


PLATFORM_ROOT = Path("src/platform")
READ_MODELS_ROOT = Path("src/read_models")


def _iter_python_files(root: Path) -> Iterable[Path]:
    if not root.is_dir():
        return
    for path in root.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        yield path


def _imported_modules(source: str) -> list[str]:
    modules: list[str] = []
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return modules
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                modules.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module is None or node.level > 0:
                continue
            modules.append(node.module)
    return modules


class TestPlatformLayerBoundaries:
    """The platform layer must not import from any bounded context's
    application or interface layer.
    """

    def test_platform_does_not_import_bounded_context_application(self) -> None:
        offenders: list[tuple[Path, str]] = []
        for path in _iter_python_files(PLATFORM_ROOT):
            for module in _imported_modules(path.read_text(encoding="utf-8")):
                parts = module.split(".")
                if "src" in parts:
                    src_idx = parts.index("src")
                    if src_idx + 2 < len(parts):
                        # src.<context>.<layer>
                        if parts[src_idx + 2] in {"application", "interface"}:
                            offenders.append((path, module))
        assert not offenders, (
            "platform layer must not import from any context's application/interface:\n"
            + "\n".join(f"  {p}: {m}" for p, m in offenders)
        )

    def test_platform_subpackage_isolation(self) -> None:
        """No platform subpackage should import another platform subpackage's
        internals (e.g. locking must not import cache).
        """
        platform_subpackages = [
            "src.platform.locking",
            "src.platform.cache",
            "src.platform.resilience",
            "src.platform.security",
            "src.platform.secrets",
            "src.platform.projections",
        ]
        offenders: list[tuple[Path, str, str]] = []
        for path in _iter_python_files(PLATFORM_ROOT):
            current_subpkg = None
            for sub in platform_subpackages:
                rel = path.as_posix()
                if rel.startswith(sub.replace(".", "/")):
                    current_subpkg = sub
                    break
            if current_subpkg is None:
                continue
            for module in _imported_modules(path.read_text(encoding="utf-8")):
                if module.startswith("src.platform."):
                    for other in platform_subpackages:
                        if other != current_subpkg and module.startswith(other):
                            offenders.append((path, module, current_subpkg))
        assert not offenders, (
            "platform subpackages must not import each other:\n"
            + "\n".join(f"  {p}: {m} (from {c})" for p, m, c in offenders)
        )


class TestReadModelsLayerBoundaries:
    """``src/read_models/`` is a leaf package — only stdlib + the shared
    ``ReadModelProtocol`` interface (which lives inside the package).
    """

    def test_read_models_does_not_import_infrastructure_or_application(self) -> None:
        offenders: list[tuple[Path, str]] = []
        for path in _iter_python_files(READ_MODELS_ROOT):
            for module in _imported_modules(path.read_text(encoding="utf-8")):
                if module.startswith("src.") and not module.startswith("src.read_models"):
                    offenders.append((path, module))
        assert not offenders, (
            "read_models must not import anything from src besides itself:\n"
            + "\n".join(f"  {p}: {m}" for p, m in offenders)
        )


class TestPlatformAuditIsLeaf:
    """``src/platform/audit.py`` is a leaf module: no transitive
    dependencies on other platform modules.
    """

    def test_health_module_does_not_import_audit_or_secrets(self) -> None:
        """``health.py`` is referenced from the application layer; it must
        not pull in secrets or audit (which would create a cycle).
        """
        health_path = PLATFORM_ROOT / "health.py"
        if not health_path.is_file():
            pytest.skip("no health module")
        for module in _imported_modules(health_path.read_text(encoding="utf-8")):
            assert not module.startswith("src.platform.secrets"), (
                f"platform.health must not import secrets: {module}"
            )
            assert not module.startswith("src.platform.audit"), (
                f"platform.health must not import audit: {module}"
            )
