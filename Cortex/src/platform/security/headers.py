"""
``SecurityHeadersMiddleware`` — HTTP security headers.

V9 Part 3, Task 28.

The middleware adds the OWASP-recommended security headers
to every response. The values are configurable via
:class:`SecurityHeadersConfig`; the defaults match the
Mozilla "Intermediate" profile.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Awaitable, Callable


@dataclass(frozen=True)
class SecurityHeadersConfig:
    """Per-deployment security header values."""

    strict_transport_security: str = "max-age=63072000; includeSubDomains; preload"
    content_security_policy: str = (
        "default-src 'self'; img-src 'self' data: https:; "
        "style-src 'self' 'unsafe-inline'; script-src 'self'; "
        "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    )
    x_content_type_options: str = "nosniff"
    referrer_policy: str = "strict-origin-when-cross-origin"
    permissions_policy: str = "geolocation=(), microphone=(), camera=()"
    x_frame_options: str = "DENY"
    # When False, the middleware short-circuits without
    # touching the response. Used for opt-out during a
    # misconfiguration investigation.
    enabled: bool = True
    extra_headers: dict[str, str] = field(default_factory=dict)


class SecurityHeadersMiddleware:
    """ASGI middleware that injects security headers into every response.

    The middleware is framework-agnostic; it is registered in
    ``main.py`` alongside the other middlewares. Tests can
    instantiate it directly with a mock ``send`` callable.
    """

    def __init__(self, app, *, config: SecurityHeadersConfig | None = None) -> None:
        self._app = app
        self._config = config or SecurityHeadersConfig()

    async def __call__(self, scope, receive, send: Callable[[dict], Awaitable[None]]):
        if scope["type"] != "http" or not self._config.enabled:
            return await self._app(scope, receive, send)

        async def wrapped_send(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                for name, value in self._header_pairs():
                    headers.append((name.encode("latin-1"), value.encode("latin-1")))
                message = {**message, "headers": headers}
            await send(message)

        await self._app(scope, receive, wrapped_send)

    def _header_pairs(self) -> list[tuple[str, str]]:
        cfg = self._config
        return [
            ("strict-transport-security", cfg.strict_transport_security),
            ("content-security-policy", cfg.content_security_policy),
            ("x-content-type-options", cfg.x_content_type_options),
            ("referrer-policy", cfg.referrer_policy),
            ("permissions-policy", cfg.permissions_policy),
            ("x-frame-options", cfg.x_frame_options),
            *cfg.extra_headers.items(),
        ]
