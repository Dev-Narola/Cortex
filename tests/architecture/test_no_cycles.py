"""Circular import detection across V9-introduced platform modules.

V9 Part 4, Task 45.

Walks every Python file under ``src/platform/`` and
``src/read_models/`` and asserts there is no cycle. The
pre-existing V1–V8 cross-context cycles are tracked as
tech debt in ``Docs/governance/architecture-debt.md``
and will be cleaned up incrementally.
"""

from __future__ import annotations

import ast
from collections import defaultdict
from pathlib import Path


PLATFORM_ROOTS = [Path("src/platform"), Path("src/read_models")]


def _iter_python_files(root: Path):
    if not root.is_dir():
        return
    for path in root.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        yield path


def _module_of(path: Path) -> str:
    """Return the dotted module name for ``path`` (best effort)."""
    parts = list(path.parts)
    if "src" in parts:
        idx = parts.index("src")
        return ".".join(parts[idx:]).removesuffix(".py").replace("\\", "/")
    return path.stem


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
        elif isinstance(node, ast.ImportFrom) and node.module is not None and node.level == 0:
            modules.append(node.module)
    return modules


def test_no_cycles_in_v9_modules() -> None:
    """V9-introduced platform + read_models modules must not form import cycles."""
    edges: dict[str, set[str]] = defaultdict(set)
    nodes: set[str] = set()
    for root in PLATFORM_ROOTS:
        for path in _iter_python_files(root):
            mod = _module_of(path)
            nodes.add(mod)
            for imported in _imported_modules(path.read_text(encoding="utf-8")):
                if imported.startswith("src.platform") or imported.startswith(
                    "src.read_models"
                ):
                    edges[mod].add(imported)
                    nodes.add(imported)

    visited: set[str] = set()
    stack: set[str] = set()
    cycles: list[list[str]] = []

    def dfs(node: str, path: list[str]) -> None:
        if node in stack:
            start = path.index(node)
            cycles.append(path[start:] + [node])
            return
        if node in visited:
            return
        visited.add(node)
        stack.add(node)
        path.append(node)
        for nxt in edges.get(node, set()):
            dfs(nxt, path)
        path.pop()
        stack.remove(node)

    for node in list(nodes):
        dfs(node, [])

    assert not cycles, (
        "V9 platform/read_models import cycles detected:\n"
        + "\n".join(" -> ".join(c) for c in cycles)
    )
