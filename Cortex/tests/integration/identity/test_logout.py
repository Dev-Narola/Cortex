"""POST /auth/logout revokes the refresh token; refresh then fails with 401."""

from __future__ import annotations

import pytest
import redis

from src.identity.infrastructure import token_denylist
from tests.integration.identity.test_identity_routes import client  # noqa: F401 - fixture


class _FakeRedis:
    def __init__(self) -> None:
        self.data: dict[str, bytes] = {}

    def set(self, key, value, ex=None):
        self.data[key] = value

    def exists(self, key):
        return int(key in self.data)


@pytest.fixture
def fake_redis(monkeypatch):
    fake = _FakeRedis()
    monkeypatch.setattr(token_denylist, "_redis", lambda: fake)
    return fake


def _register(c) -> dict:
    r = c.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": "Me",
            "tenant_slug": "logout-me",
            "email": "me@x.com",
            "password": "ValidPassword123!",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_logout_revokes_refresh_token(client, fake_redis):  # noqa: F811
    tokens = _register(client)
    rt = tokens["refresh_token"]

    assert client.post("/api/v1/auth/refresh", json={"refresh_token": rt}).status_code == 200
    assert client.post("/api/v1/auth/logout", json={"refresh_token": rt}).status_code == 204
    assert len(fake_redis.data) == 1
    assert rt not in next(iter(fake_redis.data))  # only a hash is stored

    r = client.post("/api/v1/auth/refresh", json={"refresh_token": rt})
    assert r.status_code == 401


def test_logout_with_invalid_token_is_a_noop(client, fake_redis):  # noqa: F811
    r = client.post("/api/v1/auth/logout", json={"refresh_token": "not-a-real-token"})
    assert r.status_code == 204
    assert fake_redis.data == {}


def test_logout_reports_unavailable_store(client, monkeypatch):  # noqa: F811
    tokens = _register(client)

    def down():
        raise redis.ConnectionError("down")

    class _Down:
        set = staticmethod(lambda *a, **k: down())
        exists = staticmethod(lambda *a, **k: down())

    monkeypatch.setattr(token_denylist, "_redis", lambda: _Down())
    r = client.post("/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 503
    # Reads fail open: refresh keeps working while the store is down.
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
