"""
Regression tests for the streaming chat WebSocket (audit C3).

The route used to hand an ``AsyncSession`` to the sync identity and
conversation repositories, so authentication always failed and no
message was ever stored (prod: 5 conversations, 0 messages). These
tests drive the real route over a real (SQLite) session; only the
RAG service is faked.
"""

from __future__ import annotations

import uuid

import pytest

from src.conversation.domain.entities import Citation
from src.conversation.infrastructure.models import ConversationMessageModel
from src.core.database import get_async_db, get_db
from src.main import app
from tests.integration.identity.test_identity_routes import (  # noqa: F401 - fixture
    _register_and_get_token,
    client,
)


class _FakeAnswerService:
    model_name = "fake-model"

    async def stream_answer(self, **_kwargs):
        yield {
            "kind": "citation",
            "citation": Citation(
                document_id=uuid.uuid4(),
                chunk_id=uuid.uuid4(),
                document_title="Doc",
                chunk_index=0,
                score=0.9,
                excerpt="excerpt",
            ),
        }
        yield {"kind": "token", "content": "Hello"}
        yield {"kind": "token", "content": " world"}


@pytest.fixture
def ws_client(client, monkeypatch):  # noqa: F811 - pytest fixture injection
    from src.conversation.interface.websocket import routes

    monkeypatch.setattr(routes, "build_answer_query_service", lambda *_: _FakeAnswerService())
    app.dependency_overrides[get_async_db] = lambda: None
    return client


def _create_conversation(c, token: str) -> str:
    r = c.post(
        "/api/v1/conversations",
        json={"title": "chat"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _frames_until_complete(ws) -> list[dict]:
    frames = []
    while True:
        frame = ws.receive_json()
        frames.append(frame)
        if frame["type"] in ("message_complete", "error"):
            return frames


def test_ws_turn_streams_and_persists_both_messages(ws_client):
    token = _register_and_get_token(ws_client)
    conv_id = _create_conversation(ws_client, token)

    with ws_client.websocket_connect(f"/ws/conversations/{conv_id}?token={token}") as ws:
        ws.send_json({"type": "message", "content": "What is Cortex?"})
        frames = _frames_until_complete(ws)

    types = [f["type"] for f in frames]
    assert types == ["message_start", "token", "token", "citation", "message_complete"]
    assert "".join(f["content"] for f in frames if f["type"] == "token") == "Hello world"

    db = next(app.dependency_overrides[get_db]())
    rows = db.query(ConversationMessageModel).order_by(ConversationMessageModel.created_at).all()
    assert [(r.role, r.content) for r in rows] == [
        ("user", "What is Cortex?"),
        ("assistant", "Hello world"),
    ]


def test_ws_rejects_other_tenants_conversation(ws_client):
    owner_token = _register_and_get_token(ws_client, slug="owner", email="o@x.com")
    conv_id = _create_conversation(ws_client, owner_token)
    other_token = _register_and_get_token(ws_client, slug="other", email="x@y.com")

    with ws_client.websocket_connect(f"/ws/conversations/{conv_id}?token={other_token}") as ws:
        frame = ws.receive_json()
    assert frame["type"] == "error" and frame["code"] == "FORBIDDEN"


def test_ws_rejects_missing_token(ws_client):
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect) as exc:
        with ws_client.websocket_connect(f"/ws/conversations/{uuid.uuid4()}") as ws:
            ws.receive_json()
    assert exc.value.code == 4401
