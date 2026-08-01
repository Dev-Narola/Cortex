"""Tests for SecretProvider + SecretRotationService."""

from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

import pytest

from src.platform.secrets import (
    DockerSecretProvider,
    EnvSecretProvider,
    InMemorySecretProvider,
    SecretNotFoundError,
    SecretProvider,
    SecretRotationService,
    RotationPolicy,
)


class TestInMemoryProvider:
    def test_get_returns_value(self) -> None:
        p = InMemorySecretProvider({"a": "1"})
        assert p.get("a") == "1"

    def test_missing_raises(self) -> None:
        p = InMemorySecretProvider()
        with pytest.raises(SecretNotFoundError):
            p.get("missing")

    def test_set_then_get(self) -> None:
        p = InMemorySecretProvider()
        p.set("a", "1")
        assert p.get("a") == "1"

    def test_get_many(self) -> None:
        p = InMemorySecretProvider({"a": "1", "b": "2"})
        assert p.get_many(["a", "b"]) == {"a": "1", "b": "2"}


class TestEnvProvider:
    def test_get_from_env(self) -> None:
        os.environ["CORTEX_TEST_SECRET"] = "value"
        try:
            p = EnvSecretProvider()
            assert p.get("CORTEX_TEST_SECRET") == "value"
        finally:
            del os.environ["CORTEX_TEST_SECRET"]

    def test_missing_raises(self) -> None:
        p = EnvSecretProvider(env={})
        with pytest.raises(SecretNotFoundError):
            p.get("missing")


class TestDockerProvider:
    def test_get_from_file(self, tmp_path: Path) -> None:
        secret = tmp_path / "api_key"
        secret.write_text("secret-value\n", encoding="utf-8")
        p = DockerSecretProvider(root_path=str(tmp_path))
        assert p.get("api_key") == "secret-value"

    def test_missing_raises(self, tmp_path: Path) -> None:
        p = DockerSecretProvider(root_path=str(tmp_path))
        with pytest.raises(SecretNotFoundError):
            p.get("nope")


class TestRotationService:
    async def test_register_and_is_due(self) -> None:
        provider = InMemorySecretProvider({"a": "1"})
        svc = SecretRotationService(provider=provider)
        svc.register(RotationPolicy(name="a", interval_days=1))
        assert svc.is_due("a") is False  # not due right after registration
        assert svc.due_secrets() == []

    async def test_unknown_secret_raises(self) -> None:
        provider = InMemorySecretProvider()
        svc = SecretRotationService(provider=provider)
        with pytest.raises(ValueError):
            await svc.rotate("nope")

    async def test_no_handler_raises(self) -> None:
        provider = InMemorySecretProvider()
        svc = SecretRotationService(provider=provider)
        svc.register(RotationPolicy(name="a", interval_days=1, handler=None))
        with pytest.raises(ValueError):
            await svc.rotate("a")

    async def test_rotate_with_handler(self) -> None:
        provider = InMemorySecretProvider()

        async def handler(name: str) -> str:
            return f"new-{name}"

        svc = SecretRotationService(provider=provider)
        svc.register(RotationPolicy(name="a", interval_days=1, handler=handler))
        new = await svc.rotate("a")
        assert new == "new-a"
