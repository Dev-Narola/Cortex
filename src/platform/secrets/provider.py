"""
``SecretProvider`` — pluggable secret backend.

V9 Part 3, Task 29.

The provider abstraction lets the application read secrets
without coupling to the storage mechanism. Three backends
ship today:

* :class:`EnvSecretProvider` — read from environment
  variables; the dev default.
* :class:`DockerSecretProvider` — read from
  ``/run/secrets/<name>``; the recommended production
  backend for self-hosted deployments.
* :class:`InMemorySecretProvider` — explicit in-process
  values; used by tests.

Future backends (AWS Secrets Manager, HashiCorp Vault) are
intentionally easy to add — implement :class:`SecretProvider`
and register the class in ``src/platform/dependencies.py``.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Mapping, Protocol, runtime_checkable


class SecretNotFoundError(KeyError):
    """Raised when a secret cannot be located in the backend."""


@runtime_checkable
class SecretProvider(Protocol):
    """Read-only secret backend."""

    def get(self, name: str) -> str: ...

    def get_many(self, names: list[str]) -> dict[str, str]: ...


class EnvSecretProvider:
    """Read secrets from environment variables."""

    def __init__(self, *, env: Mapping[str, str] | None = None) -> None:
        self._env = env if env is not None else os.environ

    def get(self, name: str) -> str:
        value = self._env.get(name)
        if value is None:
            raise SecretNotFoundError(name)
        return value

    def get_many(self, names: list[str]) -> dict[str, str]:
        return {name: self.get(name) for name in names}


class DockerSecretProvider:
    """Read secrets from a Docker secret mount.

    Each secret is a file under ``root_path``; the file's
    content (trimmed of trailing newlines) is the value.
    """

    def __init__(self, *, root_path: str = "/run/secrets") -> None:
        self._root = Path(root_path)

    def get(self, name: str) -> str:
        path = self._root / name
        if not path.is_file():
            raise SecretNotFoundError(name)
        return path.read_text(encoding="utf-8").strip()

    def get_many(self, names: list[str]) -> dict[str, str]:
        return {name: self.get(name) for name in names}


class InMemorySecretProvider:
    """In-process secret store; used by tests and the dev profile."""

    def __init__(self, values: Mapping[str, str] | None = None) -> None:
        self._values: dict[str, str] = dict(values or {})

    def set(self, name: str, value: str) -> None:
        self._values[name] = value

    def get(self, name: str) -> str:
        try:
            return self._values[name]
        except KeyError as exc:
            raise SecretNotFoundError(name) from exc

    def get_many(self, names: list[str]) -> dict[str, str]:
        return {name: self.get(name) for name in names}
