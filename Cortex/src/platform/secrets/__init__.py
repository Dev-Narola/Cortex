"""Secret provider + rotation.

V9 Part 3, Tasks 29 + 30.

* :class:`SecretProvider` is a pluggable abstraction. The
  default backend is the in-memory provider (dev / test);
  production should use the ``EnvSecretProvider`` or the
  ``DockerSecretProvider`` (``/run/secrets/...``).
* :class:`SecretRotationService` schedules rotation for
  the configured secrets.
"""

from __future__ import annotations

from src.platform.secrets.provider import (
    DockerSecretProvider,
    EnvSecretProvider,
    InMemorySecretProvider,
    SecretNotFoundError,
    SecretProvider,
)
from src.platform.secrets.rotation import RotationPolicy, SecretRotationService

__all__ = [
    "DockerSecretProvider",
    "EnvSecretProvider",
    "InMemorySecretProvider",
    "SecretNotFoundError",
    "SecretProvider",
    "RotationPolicy",
    "SecretRotationService",
]
