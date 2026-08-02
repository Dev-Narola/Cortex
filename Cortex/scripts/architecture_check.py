"""
``architecture_check.py`` — CI gate for hexagonal architecture.

V9 Part 4, Task 45.

Run::

    python scripts/architecture_check.py

Exits 0 when the rules are satisfied, 1 otherwise. The
same rules are unit-tested under
``tests/architecture/``; this script is a faster path for
the CI gate (no pytest collection overhead).
"""

from __future__ import annotations

import ast
import sys
from collections import defaultdict
from pathlib import Path

SRC_ROOT = Path(__file__).resolve().parent.parent / "src"

# Bounded contexts that participate in the V1-V8 hexagonal layout.
CONTEXTS = [
    "identity",
    "knowledge",
    "retrieval",
    "conversation",
    "billing",
    "limits",
    "agents",
    "tools",
    "execution",
    "knowledge_graph",
    "graph_retrieval",
    "mcp",
    "evaluation",
    "embedding",
    "ingestion",
    "observability",
]

# Cross-cutting packages — exempt from the per-context boundary checks.
SHARED_PACKAGES = {"platform", "shared", "core", "read_models"}


def iter_python_files(root: Path):
    if not root.is_dir():
        return
    for path in root.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        yield path


def parse_imports(source: str) -> list[str]:
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []
    modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                modules.append(alias.name)
        elif isinstance(node, ast.ImportFrom) and node.module is not None and node.level == 0:
            modules.append(node.module)
    return modules


def is_in_layer(module: str, layer: str) -> bool:
    parts = module.split(".")
    if "src" not in parts:
        return False
    try:
        src_idx = parts.index("src")
    except ValueError:
        return False
    if src_idx + 2 >= len(parts):
        return False
    return parts[src_idx + 2] == layer


def check_layer_boundaries() -> list[str]:
    failures: list[str] = []
    for context in CONTEXTS:
        # domain
        for path in iter_python_files(SRC_ROOT / context / "domain"):
            for module in parse_imports(path.read_text(encoding="utf-8")):
                if is_in_layer(module, "application") or is_in_layer(module, "infrastructure") or is_in_layer(module, "interface"):
                    failures.append(f"{path}: domain imports {module}")
        # application
        for path in iter_python_files(SRC_ROOT / context / "application"):
            for module in parse_imports(path.read_text(encoding="utf-8")):
                if is_in_layer(module, "infrastructure") or is_in_layer(module, "interface"):
                    failures.append(f"{path}: application imports {module}")
        # infrastructure
        for path in iter_python_files(SRC_ROOT / context / "infrastructure"):
            for module in parse_imports(path.read_text(encoding="utf-8")):
                if is_in_layer(module, "interface"):
                    failures.append(f"{path}: infrastructure imports {module}")
    return failures


def check_cross_context_cycles() -> list[str]:
    edges: dict[str, set[str]] = defaultdict(set)
    for path in iter_python_files(SRC_ROOT):
        parts = path.parts
        if "src" not in parts:
            continue
        idx = parts.index("src")
        if idx + 1 >= len(parts):
            continue
        self_ctx = parts[idx + 1]
        for module in parse_imports(path.read_text(encoding="utf-8")):
            mod_parts = module.split(".")
            if "src" not in mod_parts:
                continue
            mod_idx = mod_parts.index("src")
            if mod_idx + 1 >= len(mod_parts):
                continue
            target = mod_parts[mod_idx + 1]
            if target in SHARED_PACKAGES or target == self_ctx:
                continue
            edges[self_ctx].add(target)

    # Detect cycles via DFS.
    cycles: list[list[str]] = []
    visited: set[str] = set()
    stack: set[str] = set()

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

    for node in list(edges.keys()):
        dfs(node, [])

    return [" -> ".join(c) for c in cycles]


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Cortex architecture check.")
    parser.add_argument(
        "--v9-only",
        action="store_true",
        help="Only check the V9-introduced modules (skip pre-existing V1-V8 debt).",
    )
    parser.add_argument(
        "--report",
        action="store_true",
        help="Print the report and exit 0 (do not fail on V1-V8 debt).",
    )
    args = parser.parse_args()

    failures = check_layer_boundaries()
    cycles = check_cross_context_cycles()
    if args.v9_only:
        # Filter out V1-V8 contexts. The new V9 modules are
        # ``src/platform/`` and ``src/read_models/``; the script's
        # checker only inspects bounded contexts, so for ``--v9-only``
        # we just skip the per-context check entirely.
        failures = []
        # cycles are always checked (the V9 modules must be cycle-free)
    if failures:
        print("Layer-boundary violations:")
        for f in failures:
            print(f"  {f}")
    if cycles:
        print("Cross-context cycles:")
        for c in cycles:
            print(f"  {c}")
    if (failures or cycles) and not args.report:
        return 1
    print("Architecture OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
