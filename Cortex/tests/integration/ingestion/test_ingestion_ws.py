"""/ws/ingestion forwards the tenant's live status events (progress bars)."""

from __future__ import annotations

import asyncio
import json

from src.ingestion.infrastructure import status_events
from src.ingestion.interface.websocket import routes
from tests.integration.identity.test_identity_routes import (  # noqa: F401 - fixture
    _register_and_get_token,
    client,
)


class _FakePubSub:
    def __init__(self, messages):
        self.messages = messages
        self.channel = None

    async def subscribe(self, channel):
        self.channel = channel

    async def listen(self):
        for m in self.messages:
            yield m
        await asyncio.Event().wait()  # stay open like a real subscription

    async def unsubscribe(self):
        pass

    async def aclose(self):
        pass


def test_status_events_reach_the_socket(client, monkeypatch):  # noqa: F811
    token = _register_and_get_token(client)
    event = status_events.status_message("doc-1", "chunking")
    pubsub = _FakePubSub([{"type": "subscribe", "data": 1}, {"type": "message", "data": event}])

    class _Redis:
        def pubsub(self):
            return pubsub

    async def fake_get_redis():
        return _Redis()

    monkeypatch.setattr(routes, "get_redis", fake_get_redis)
    with client.websocket_connect(f"/ws/ingestion?token={token}") as ws:
        frame = json.loads(ws.receive_text())
        ws.send_text("ping")
        assert ws.receive_text() == "pong"

    assert frame["type"] == "ingestion.status"
    assert frame["document_id"] == "doc-1" and frame["status"] == "chunking"
    me = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert pubsub.channel == f"cortex:ingestion:{me['tenant_id']}"  # tenant-scoped


def test_closes_when_status_channel_unavailable(client, monkeypatch):  # noqa: F811
    from starlette.websockets import WebSocketDisconnect

    token = _register_and_get_token(client)

    async def down():
        raise RuntimeError("Redis is not available")

    monkeypatch.setattr(routes, "get_redis", down)
    with client.websocket_connect(f"/ws/ingestion?token={token}") as ws:
        try:
            ws.receive_text()
            raise AssertionError("expected the socket to close")
        except WebSocketDisconnect as exc:
            assert exc.code == 1011  # client falls back to polling


def test_status_message_shape():
    msg = json.loads(status_events.status_message("d1", status_events.DocumentStatus.INDEXED))
    assert msg["type"] == "ingestion.status" and msg["status"] == "indexed"
    assert isinstance(msg["timestamp"], int)
