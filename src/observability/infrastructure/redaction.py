"""
Sensitive-data redaction for telemetry.

A single chokepoint for "before we put this dict into a log
line / span attribute / metric, scrub the bits that should
never leave the process". Used by:

* the structlog processor in :mod:`src.core.logging`,
* the trace middleware in :mod:`src.core.middleware`,
* the GenAI span helper in
  :mod:`src.observability.infrastructure.genai_spans`,

so the redaction policy lives in *one* place. Adding a new
sensitive key here is enough to scrub it everywhere.

What's redacted:

* Anything matching a key in ``SENSITIVE_KEYS`` (case
  insensitive) is replaced with ``[REDACTED]``.
* String values that look like they might be a credential
  (bearer tokens, API keys, JWT-shaped strings) are
  scrubbed by a content-level check.
* Document content / chunk content / raw LLM prompts are
  *never* added to spans or logs by default. They go through
  a separate, opt-in debug pipeline that lives outside this
  module.

What is *not* redacted (intentional):

* UUIDs and chunk ids — these are not sensitive and
  correlation is more valuable than obfuscation.
* Tenant ids — same reason.
* Token counts and cost — these are the metric, not the
  payload.
* Provider / model names.

The contract is: if you find yourself wanting to log a
document's text or a user's API key, *don't*; the redaction
layer is not a substitute for the rule "don't put that in a
log line".
"""

from __future__ import annotations

import re
from typing import Any, Iterable


# --- key-based redaction ---------------------------------------------------


# Keys (case-insensitive) whose values are always replaced with
# ``"[REDACTED]"``. Matched as exact key or as a suffix of a
# dotted path — so ``"jwt"``, ``"user.jwt"`` and ``"headers.jwt"``
# all scrub. Add to this list as new sensitive fields are
# introduced; do not scatter redaction calls through call sites.
SENSITIVE_KEYS: frozenset[str] = frozenset(
    {
        "password",
        "passwd",
        "pwd",
        "secret",
        "token",
        "api_key",
        "apikey",
        "access_token",
        "refresh_token",
        "authorization",
        "auth",
        "jwt",
        "bearer",
        "x-api-key",
        "x_auth_token",
        "private_key",
        "client_secret",
        "session",
        "cookie",
        "set-cookie",
    }
)

# Suffixes — if a key ends in any of these, redact. Catches
# ``"user_password"`` and ``"config.jwt"`` without enumerating
# every variant.
SENSITIVE_SUFFIXES: tuple[str, ...] = (
    "_password",
    "_token",
    "_secret",
    "_key",
    "_api_key",
    "_apikey",
    "_jwt",
    "_authorization",
)

REDACTED = "[REDACTED]"


# --- content-based redaction ----------------------------------------------

# Bearer / JWT / API-key-shaped strings. Matched as a fallback
# when a *value* looks like a credential even if the key isn't
# in the deny list. This is a defence-in-depth measure, not the
# primary defence — keys still need to be in SENSITIVE_KEYS.
_CREDENTIAL_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"^Bearer\s+[A-Za-z0-9._\-]{8,}$"),
    re.compile(r"^sk-[A-Za-z0-9]{20,}$"),  # OpenAI-style API keys
    re.compile(r"^sk-ant-[A-Za-z0-9\-]{20,}$"),  # Anthropic
    re.compile(r"^xai-[A-Za-z0-9]{20,}$"),  # xAI / Grok
    re.compile(r"^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$"),  # JWT
)


def _key_should_be_redacted(key: str) -> bool:
    """Return True if *key* (case-insensitive, dotted path) is
    on the deny list."""
    k = key.lower()
    if k in SENSITIVE_KEYS:
        return True
    for suffix in SENSITIVE_SUFFIXES:
        if k.endswith(suffix):
            return True
    return False


def _value_looks_like_credential(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    v = value.strip()
    if len(v) < 12:
        # Too short to be a meaningful credential.
        return False
    for pat in _CREDENTIAL_PATTERNS:
        if pat.match(v):
            return True
    return False


# --- public API ------------------------------------------------------------


def redact(payload: Any) -> Any:
    """
    Recursively scrub a dict / list / scalar of its sensitive
    keys and credential-shaped values.

    Behaviour:

    * ``dict`` — every key is checked against ``SENSITIVE_KEYS``;
      matching values are replaced with ``"[REDACTED]"``. The
      recursion continues on every other value.
    * ``list`` / ``tuple`` — every element is recursed into; the
      same shape is returned.
    * scalar — returned unchanged unless it looks like a
      credential, in which case it is replaced with
      ``"[REDACTED]"``. (This last case rarely fires — most
      call sites know to scrub by *key*, not by *value* — but
      it's a useful backstop.)
    """
    if isinstance(payload, dict):
        out: dict = {}
        for k, v in payload.items():
            if _key_should_be_redacted(str(k)):
                out[k] = REDACTED
            else:
                out[k] = redact(v)
        return out
    if isinstance(payload, list):
        return [redact(v) for v in payload]
    if isinstance(payload, tuple):
        return tuple(redact(v) for v in payload)
    if _value_looks_like_credential(payload):
        return REDACTED
    return payload


def redact_keys(payload: dict, keys: Iterable[str]) -> dict:
    """
    Convenience: redact only the named keys, leave everything
    else alone. Use when the allowlist is much smaller than the
    blocklist (e.g. a span attribute dict that may legitimately
    contain ``chunk_id`` / ``tenant_id``).
    """
    blocklist = {k.lower() for k in keys}
    out: dict = {}
    for k, v in payload.items():
        if str(k).lower() in blocklist:
            out[k] = REDACTED
        else:
            out[k] = redact(v)
    return out


__all__ = [
    "REDACTED",
    "SENSITIVE_KEYS",
    "redact",
    "redact_keys",
]
