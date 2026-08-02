"""
Unit tests for the WebSocket envelope protocol defined in
``src.conversation.interface.websocket.handlers``.

Pure-function tests — no WebSocket plumbing, no live server.
Each envelope type is exercised in isolation and the parser is
checked against the documented client-side shapes.
"""

from __future__ import annotations

import uuid

import pytest

from src.conversation.interface.websocket.handlers import (
    make_citation,
    make_error,
    make_message_complete,
    make_message_start,
    make_token,
    parse_client_message,
)


class TestServerEnvelopes:
    def test_message_start(self):
        env = make_message_start()
        assert env["type"] == "message_start"
        assert "message_id" in env
        uuid.UUID(env["message_id"])  # parses

    def test_message_start_with_id(self):
        mid = uuid.uuid4()
        env = make_message_start(mid)
        assert env["message_id"] == str(mid)

    def test_token(self):
        env = make_token("hello")
        assert env == {"type": "token", "content": "hello"}

    def test_citation_minimal(self):
        doc = uuid.uuid4()
        chunk = uuid.uuid4()
        env = make_citation(
            document_id=doc,
            chunk_id=chunk,
            document_title="Doc",
            chunk_index=7,
        )
        assert env["type"] == "citation"
        c = env["citation"]
        assert c["document_id"] == str(doc)
        assert c["chunk_id"] == str(chunk)
        assert c["document_title"] == "Doc"
        assert c["chunk_index"] == 7
        assert c["score"] == 0.0
        assert "excerpt" not in c  # optional, omitted

    def test_citation_full(self):
        env = make_citation(
            document_id=uuid.uuid4(),
            chunk_id=uuid.uuid4(),
            document_title="Doc",
            chunk_index=0,
            score=0.91,
            excerpt="snippet",
        )
        c = env["citation"]
        assert c["score"] == 0.91
        assert c["excerpt"] == "snippet"

    def test_message_complete(self):
        mid = uuid.uuid4()
        env = make_message_complete(mid)
        assert env == {"type": "message_complete", "message_id": str(mid)}

    def test_error(self):
        env = make_error("GENERATION_FAILED", "boom")
        assert env == {"type": "error", "code": "GENERATION_FAILED", "message": "boom"}

    def test_error_without_message(self):
        env = make_error("BAD_REQUEST")
        assert env == {"type": "error", "code": "BAD_REQUEST"}


class TestClientParser:
    def test_parses_valid_message(self):
        kind, payload = parse_client_message({"type": "message", "content": "hi"})
        assert kind == "message"
        assert payload == {"content": "hi"}

    def test_rejects_non_dict(self):
        with pytest.raises(ValueError):
            parse_client_message([])  # type: ignore[arg-type]

    def test_rejects_unknown_type(self):
        with pytest.raises(ValueError):
            parse_client_message({"type": "tool_call", "content": "x"})

    def test_rejects_empty_content(self):
        with pytest.raises(ValueError):
            parse_client_message({"type": "message", "content": ""})

    def test_rejects_missing_content(self):
        with pytest.raises(ValueError):
            parse_client_message({"type": "message"})
