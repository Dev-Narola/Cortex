"""Request rate limits per tenant, per API key, and for login (FR-AUTH-02, FR-BILL-02)."""

from __future__ import annotations

import pytest
import redis

from src.core.config import settings
from src.limits.application import request_limits
from tests.integration.identity.test_identity_routes import (  # noqa: F401 - fixture
    _register_and_get_token,
    client,
)


class _FakeRedis:
    def __init__(self):
        self.counts: dict[str, int] = {}

    def pipeline(self):
        return _FakePipe(self)


class _FakePipe:
    def __init__(self, r):
        self.r, self.ops = r, []

    def incr(self, key):
        self.ops.append(key)

    def expire(self, *_):
        pass

    def execute(self):
        out = []
        for key in self.ops:
            self.r.counts[key] = self.r.counts.get(key, 0) + 1
            out.append(self.r.counts[key])
        return out + [True]


@pytest.fixture
def limited(client, monkeypatch):  # noqa: F811 - pytest fixture injection
    monkeypatch.setattr(request_limits, "_redis", lambda: _FakeRedis.shared)
    _FakeRedis.shared = _FakeRedis()
    return client


def _key(c, token, limit=None):
    body = {"name": "k", "scopes": ["documents:read"]}
    if limit:
        body["rate_limit_per_min"] = limit
    r = c.post("/api/v1/api-keys", json=body, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()["raw_key"]


def test_per_key_limit_returns_429_with_retry_after(limited):
    token = _register_and_get_token(limited)
    raw = _key(limited, token, limit=2)
    codes = [limited.get("/api/v1/documents", headers={"X-API-Key": raw}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    r = limited.get("/api/v1/documents", headers={"X-API-Key": raw})
    assert 1 <= int(r.headers["Retry-After"]) <= 60


def test_keys_are_limited_independently(limited):
    token = _register_and_get_token(limited)
    a, b = _key(limited, token, limit=1), _key(limited, token, limit=1)
    assert limited.get("/api/v1/documents", headers={"X-API-Key": a}).status_code == 200
    assert limited.get("/api/v1/documents", headers={"X-API-Key": b}).status_code == 200
    assert limited.get("/api/v1/documents", headers={"X-API-Key": a}).status_code == 429


def test_tenant_limit_is_per_tenant(limited, monkeypatch):
    t1 = _register_and_get_token(limited, slug="one", email="1@x.com")
    t2 = _register_and_get_token(limited, slug="two", email="2@x.com")
    monkeypatch.setattr(settings, "TENANT_REQUESTS_PER_MINUTE", 2)
    me = lambda t: limited.get("/api/v1/users/me", headers={"Authorization": f"Bearer {t}"})  # noqa: E731
    assert [me(t1).status_code for _ in range(3)] == [200, 200, 429]
    assert me(t2).status_code == 200


def test_login_attempts_are_capped(limited, monkeypatch):
    _register_and_get_token(limited)
    monkeypatch.setattr(settings, "LOGIN_ATTEMPTS_PER_MINUTE", 2)
    body = {"tenant_slug": "me", "email": "me@x.com", "password": "wrong-password"}
    codes = [limited.post("/api/v1/auth/login", json=body).status_code for _ in range(3)]
    assert codes == [401, 401, 429]


def test_fails_open_when_redis_is_down(client, monkeypatch):  # noqa: F811
    class _Down:
        def pipeline(self):
            raise redis.ConnectionError("down")

    monkeypatch.setattr(request_limits, "_redis", lambda: _Down())
    monkeypatch.setattr(settings, "TENANT_REQUESTS_PER_MINUTE", 1)
    token = _register_and_get_token(client)
    for _ in range(3):
        assert client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200
