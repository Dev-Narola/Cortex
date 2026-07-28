"""
WebSocket protocol and message envelope definitions.

The protocol is intentionally small and additive: the server
emits a sequence of JSON envelopes, each with a ``type`` field.
Clients should ignore unknown types so a future protocol bump
(server gains a new event) doesn't break older clients.

Envelope types the server emits:

* ``message_start``  — a new assistant turn has started. Carries
  ``message_id`` (the assistant message will be persisted with
  this id once streaming completes).
* ``token``          — a single token of the streamed answer.
  ``content`` is the token string (NOT the cumulative answer).
* ``citation``       — the assistant is grounding against a chunk
  it actually retrieved. ``citation`` carries ``document_id``,
  ``chunk_id``, ``document_title``, ``chunk_index``, and the
  optional ``excerpt``. Citations are always emitted in
  numerical order (``[1]``, ``[2]``, …) so the client can render
  inline markers in the answer.
* ``message_complete`` — the assistant turn has finished. The
  client should now have everything it needs to render the
  final answer; the server has already persisted the message.
* ``error``          — the assistant turn failed. ``code`` is a
  short string (e.g. ``GENERATION_FAILED``), ``message`` is
  optional and human-readable.

Envelope types the client sends:

* ``message``        — a user question. ``content`` is the
  question text. The server replies with the full sequence
  above.

This module is the single source of truth for these shapes;
both the route layer and the test suite import from here.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

# Discriminator union of all envelope types. Kept as a closed
# set of Literal strings so static type-checkers flag typos.

ServerEventType = Literal[
    "message_start",
    "token",
    "citation",
    "message_complete",
    "error",
]

ClientEventType = Literal["message"]


@dataclass
class ServerEnvelope:
    """Wrapper used internally; serialise via ``.to_dict()``."""

    type: ServerEventType
    payload: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {"type": self.type, **self.payload}


def make_message_start(message_id: uuid.UUID | None = None) -> dict[str, Any]:
    return ServerEnvelope(
        type="message_start",
        payload={"message_id": str(message_id or uuid.uuid4())},
    ).to_dict()


def make_token(content: str) -> dict[str, Any]:
    # A single token. Clients append to the current assistant
    # message; they do not treat this as a complete message.
    return ServerEnvelope(
        type="token",
        payload={"content": content},
    ).to_dict()


def make_citation(
    *,
    document_id: uuid.UUID,
    chunk_id: uuid.UUID,
    document_title: str,
    chunk_index: int,
    score: float = 0.0,
    excerpt: str | None = None,
) -> dict[str, Any]:
    citation: dict[str, Any] = {
        "document_id": str(document_id),
        "chunk_id": str(chunk_id),
        "document_title": document_title,
        "chunk_index": chunk_index,
        "score": score,
    }
    if excerpt is not None:
        citation["excerpt"] = excerpt
    return ServerEnvelope(
        type="citation",
        payload={"citation": citation},
    ).to_dict()


def make_message_complete(message_id: uuid.UUID) -> dict[str, Any]:
    return ServerEnvelope(
        type="message_complete",
        payload={"message_id": str(message_id)},
    ).to_dict()


def make_error(code: str, message: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"code": code}
    if message is not None:
        payload["message"] = message
    return ServerEnvelope(type="error", payload=payload).to_dict()


def parse_client_message(raw: dict[str, Any]) -> tuple[ClientEventType, dict[str, Any]]:
    """
    Validate and unpack a client envelope.

    Returns ``(type, payload)``. Raises ``ValueError`` on any
    shape mismatch so the WebSocket route can close the
    connection with a clean ``4003`` code instead of crashing.
    """
    if not isinstance(raw, dict):
        raise ValueError("client message must be a JSON object")
    t = raw.get("type")
    if t != "message":
        raise ValueError(f"unknown client message type: {t!r}")
    content = raw.get("content")
    if not isinstance(content, str) or not content.strip():
        raise ValueError("'content' must be a non-empty string")
    return "message", {"content": content}


__all__ = [
    "ClientEventType",
    "ServerEnvelope",
    "ServerEventType",
    "make_citation",
    "make_error",
    "make_message_complete",
    "make_message_start",
    "make_token",
    "parse_client_message",
]
