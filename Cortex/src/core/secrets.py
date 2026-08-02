"""
Secret resolution for Cortex.

V5 introduces a layered lookup that is the *only* place secrets
are read. Resolution order (first hit wins):

  1. ``os.environ`` — the standard container-injected env var.
     ``start.sh`` populates this from AWS Secrets Manager on
     container start, so production apps see their secrets as
     ordinary env vars at runtime.
  2. AWS Secrets Manager — fetched lazily on first use when an
     environment variable is missing. Requires an IAM role with
     ``secretsmanager:GetSecretValue`` on the relevant secret ARN
     (or ``*`` for the dev case). The instance role attached to
     the EC2 host is resolved automatically by boto3.
  3. ``None`` — the call site decides what to do with a missing
     secret. Most code paths raise a clear error at startup so
     the container exits fast instead of serving a half-broken
     service.

Design choices and why they are here:

* **Boto3 is optional at import time.** A developer machine or
  a test runner that never needs Secrets Manager should not be
  forced to install the AWS SDK to import this module. The
  import happens lazily inside :func:`_fetch_from_secrets_manager`
  so a missing ``boto3`` raises a friendly error only when the
  code actually tries to call the real service.
* **Cached per process.** A given secret name is fetched at
  most once per process. Restart the container to refresh.
  This is the right default — the alternative (a TTL cache) is
  an optimization that does not match how production rotates
  secrets (rotation events typically restart the workload).
* **No plaintext secrets on disk.** The container's filesystem
  never holds a ``.env`` file in production. ``start.sh``
  exports secrets into the worker process env and the
  container is ephemeral.
* **Fail loud on parse errors.** If Secrets Manager returns a
  JSON blob we cannot parse, or an env var is set to an empty
  string, we treat it as missing. This avoids the classic
  "SECRET_KEY='' silently produces an insecure JWT signer"
  failure mode.

This module is intentionally tiny. If you find yourself wanting
to add caching, fallback chains, or per-tenant secret scoping,
the right move is a dedicated ``SecretProvider`` class in
``core/secrets_providers.py`` — not more branching in here.
"""

from __future__ import annotations

import json
import logging
import os
from threading import Lock
from typing import Any

logger = logging.getLogger(__name__)

# Cache: secret-name -> resolved string value. Bounded by the
# number of distinct secrets the app reads; no eviction needed
# because rotation = container restart by convention.
_cache: dict[str, str | None] = {}
_cache_lock = Lock()


def get_secret(secret_name: str, *, required: bool = False) -> str | None:
    """
    Resolve a secret by its environment-variable name.

    ``secret_name`` is the *env var name* (e.g. ``SECRET_KEY``),
    not the Secrets Manager secret ID. By convention we use the
    same identifier for both: the env var name is the canonical
    name, and the Secrets Manager secret is stored under the
    same key.

    Args:
        secret_name: The env-var / Secrets-Manager key to resolve.
        required: If True and the value is missing, raise
            ``RuntimeError`` instead of returning ``None``. Use
            this for values that the app genuinely cannot run
            without (e.g. ``SECRET_KEY``, ``DATABASE_URL``).

    Returns:
        The resolved string, or ``None`` if missing and not
        required.
    """
    value = _lookup(secret_name)
    if value is None and required:
        raise RuntimeError(
            f"Required secret '{secret_name}' is not set. "
            f"Provide it via the environment or AWS Secrets Manager."
        )
    return value


def get_api_key(service: str) -> str | None:
    """
    Backwards-compat helper: get an API key for a named service.

    Example: ``service='openai'`` -> ``OPENAI_API_KEY``.

    Kept as a separate function rather than folded into
    :func:`get_secret` so legacy callers (``from src.core.secrets
    import get_api_key``) do not have to change.
    """
    env_var = f"{service.upper()}_API_KEY"
    return _lookup(env_var)


def get_json_secret(secret_name: str) -> dict[str, Any] | None:
    """
    Resolve a secret that is stored as a JSON blob.

    Returns ``None`` if the secret is missing. Raises
    ``json.JSONDecodeError`` if the secret exists but is not
    valid JSON — fail-loud is the right call for malformed
    configuration so the operator notices at deploy time
    rather than at the first API call.
    """
    raw = _lookup(secret_name)
    if raw is None:
        return None
    return json.loads(raw)


def clear_cache() -> None:
    """
    Drop the in-process cache. Test-only helper.
    """
    with _cache_lock:
        _cache.clear()


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _lookup(secret_name: str) -> str | None:
    """
    Resolve a single secret name, using the cache.

    Order:
      1. Process environment (already populated by start.sh
         from Secrets Manager in production).
      2. AWS Secrets Manager via boto3.
      3. Empty string is treated as "missing" so a half-loaded
         .env does not produce silently broken config.
    """
    with _cache_lock:
        if secret_name in _cache:
            return _cache[secret_name]

    # 1) Environment. ``os.environ`` is the fastest path; in
    # production this is what ``start.sh`` populated.
    raw = os.environ.get(secret_name)
    if raw:
        with _cache_lock:
            _cache[secret_name] = raw
        return raw

    # 2) Secrets Manager. We only attempt this when no env var
    # is set, so dev environments that never configure AWS
    # credentials simply get ``None`` instead of a noisy
    # boto3 import / error on every call.
    value = _fetch_from_secrets_manager(secret_name)
    with _cache_lock:
        _cache[secret_name] = value
    return value


def _fetch_from_secrets_manager(secret_name: str) -> str | None:
    """
    Fetch a secret from AWS Secrets Manager.

    Returns ``None`` when:

    * boto3 is not installed,
    * no AWS credentials are available in the environment,
    * the secret does not exist,
    * access is denied (the IAM role lacks permission).

    Logs a single ``WARNING`` line per miss so a misconfigured
    production role is easy to spot in the worker logs without
    a stack trace on every secret read.
    """
    try:
        import boto3
        from botocore.exceptions import BotoCoreError, ClientError
    except ImportError:
        # boto3 missing — almost always the dev / test path.
        return None

    try:
        client = boto3.client("secretsmanager")
        response = client.get_secret_value(SecretId=secret_name)
    except (ClientError, BotoCoreError) as exc:
        # Most common cause: no instance role, or the secret is
        # not present. Either way, surface the failure clearly
        # so the operator can fix the IAM policy.
        logger.warning(
            "secrets_manager_fetch_failed",
            extra={"secret_name": secret_name, "error": str(exc)},
        )
        return None

    return response.get("SecretString")


__all__ = [
    "clear_cache",
    "get_api_key",
    "get_json_secret",
    "get_secret",
]
