"""
Unit tests for MCP domain value objects.
"""

from __future__ import annotations

import pytest

from src.mcp.domain.value_objects import (
    MCPCapability,
    MCPClientType,
    MCPProtocolVersion,
    MCPSessionState,
    MCPTransport,
)


class TestMCPTransport:
    def test_enum_values(self):
        assert MCPTransport.STDIO == "stdio"
        assert MCPTransport.HTTP == "http"
        assert MCPTransport.WEBSOCKET == "websocket"

    def test_from_string(self):
        assert MCPTransport("websocket") == MCPTransport.WEBSOCKET


class TestMCPCapability:
    def test_all_capabilities_exist(self):
        expected = {"tools", "resources", "prompts", "sampling", "logging",
                    "completion", "streaming", "progress", "cancellation"}
        actual = {c.value for c in MCPCapability}
        assert actual == expected


class TestMCPSessionState:
    def test_lifecycle_states(self):
        states = [s.value for s in MCPSessionState]
        assert "initializing" in states
        assert "active" in states
        assert "disconnected" in states
        assert "expired" in states


class TestMCPClientType:
    def test_client_types(self):
        assert MCPClientType.DESKTOP.value == "desktop"
        assert MCPClientType.IDE.value == "ide"
        assert MCPClientType.CLI.value == "cli"


class TestMCPProtocolVersion:
    def test_parse_valid(self):
        v = MCPProtocolVersion.parse("1.2.3")
        assert v.major == 1
        assert v.minor == 2
        assert v.patch == 3

    def test_parse_invalid_defaults(self):
        v = MCPProtocolVersion.parse("bad")
        assert v.major == 1
        assert v.minor == 0
        assert v.patch == 0

    def test_is_compatible_same_major(self):
        v1 = MCPProtocolVersion(major=1, minor=0, patch=0)
        v2 = MCPProtocolVersion(major=1, minor=5, patch=3)
        assert v1.is_compatible_with(v2)

    def test_is_incompatible_different_major(self):
        v1 = MCPProtocolVersion(major=1, minor=0, patch=0)
        v2 = MCPProtocolVersion(major=2, minor=0, patch=0)
        assert not v1.is_compatible_with(v2)

    def test_str_representation(self):
        v = MCPProtocolVersion(major=1, minor=2, patch=3)
        assert str(v) == "1.2.3"
