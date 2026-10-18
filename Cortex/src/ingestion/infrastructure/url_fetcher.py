"""
Fetch a remote document for URL ingestion, safely (FR-ING-01).

SSRF defence:
* only http/https on the default ports, no userinfo in the URL;
* every address the host resolves to must be globally routable, which
  rejects loopback, RFC 1918, link-local (169.254.169.254 metadata),
  CGNAT, multicast, reserved and IPv6 ULA/link-local;
* the connection goes to the vetted IP (Host header + TLS SNI keep the
  name), so a DNS rebind between check and connect can't redirect it;
* redirects are followed by hand, each hop re-vetted, at most 3;
* body capped at MAX_DOCUMENT_SIZE_BYTES, 10 s total budget.
"""

from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

import httpx

from src.core.config import settings
from src.shared.exceptions import ValidationException

_MAX_REDIRECTS = 3
_TIMEOUT_SECONDS = 10.0
_DEFAULT_PORTS = {"http": 80, "https": 443}
# Served type -> type the parsers understand (HTML is reduced to text).
_ACCEPTED = {
    "text/html": "text/plain",
    "application/xhtml+xml": "text/plain",
    "text/plain": "text/plain",
    "text/markdown": "text/markdown",
    "application/pdf": "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ),
}
_EXTENSIONS = {
    "text/plain": ".txt",
    "text/markdown": ".md",
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}

Resolver = Callable[[str, int], Awaitable[list[str]]]


class UnsafeURLError(ValidationException):
    def __init__(self, message: str) -> None:
        super().__init__(message=message, code=400, data={"field": "url"})


@dataclass(frozen=True)
class FetchedDocument:
    content: bytes
    mime_type: str
    title: str
    filename: str
    final_url: str


async def _system_resolver(host: str, port: int) -> list[str]:
    infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return [info[4][0] for info in infos]


def _vet_url(url: str) -> tuple[str, str, int]:
    parts = urlsplit(url)
    scheme = (parts.scheme or "").lower()
    if scheme not in _DEFAULT_PORTS:
        raise UnsafeURLError("Only http and https URLs can be ingested.")
    if parts.username or parts.password:
        raise UnsafeURLError("URLs with credentials are not allowed.")
    if not parts.hostname:
        raise UnsafeURLError("URL has no host.")
    port = parts.port or _DEFAULT_PORTS[scheme]
    if port != _DEFAULT_PORTS[scheme]:
        raise UnsafeURLError("Only the default http/https ports are allowed.")
    return scheme, parts.hostname, port


def _vet_ip(raw: str) -> str:
    ip = ipaddress.ip_address(raw.split("%")[0])
    # IPv4-mapped IPv6 (::ffff:10.0.0.1) must be judged as the IPv4 inside.
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    if not ip.is_global or ip.is_multicast:
        raise UnsafeURLError("URL resolves to a private or reserved address.")
    return str(ip)


async def _pinned_target(url: str, resolver: Resolver) -> tuple[str, str]:
    """Return ``(url_with_vetted_ip, hostname)``; raise if any address is unsafe."""
    scheme, host, port = _vet_url(url)
    try:
        addresses = await resolver(host, port)
    except OSError as exc:
        raise UnsafeURLError(f"Could not resolve host: {host}") from exc
    if not addresses:
        raise UnsafeURLError(f"Could not resolve host: {host}")
    vetted = [_vet_ip(a) for a in addresses]  # all must be safe, not just the first
    ip = vetted[0]
    netloc = f"[{ip}]" if ":" in ip else ip
    parts = urlsplit(url)
    path = parts.path or "/"
    pinned = f"{scheme}://{netloc}{path}" + (f"?{parts.query}" if parts.query else "")
    return pinned, host


class _TextExtractor(HTMLParser):
    _SKIP = {"script", "style", "noscript", "template", "svg", "head"}

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.title = ""
        self._skip_depth = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self._in_title = True
        elif tag in self._SKIP:
            self._skip_depth += 1
        elif tag in {"p", "br", "div", "li", "h1", "h2", "h3", "h4", "tr", "section"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag in self._SKIP and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skip_depth:
            self.parts.append(data)


def html_to_text(html: str) -> tuple[str, str]:
    """``(title, text)`` with scripts/styles dropped and whitespace collapsed."""
    parser = _TextExtractor()
    parser.feed(html)
    text = re.sub(r"[ \t\r\f\v]+", " ", "".join(parser.parts))
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()
    return parser.title.strip(), text


async def fetch_url(
    url: str,
    *,
    resolver: Resolver = _system_resolver,
    transport: httpx.AsyncBaseTransport | None = None,
) -> FetchedDocument:
    limit = settings.MAX_DOCUMENT_SIZE_BYTES
    async with httpx.AsyncClient(
        transport=transport, timeout=_TIMEOUT_SECONDS, follow_redirects=False
    ) as client:
        current = url
        for _ in range(_MAX_REDIRECTS + 1):
            pinned, host = await _pinned_target(current, resolver)
            request = client.build_request(
                "GET",
                pinned,
                headers={"Host": host, "User-Agent": "Cortex-Ingest/1.0"},
                extensions={"sni_hostname": host},
            )
            response = await client.send(request, stream=True)
            try:
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        raise UnsafeURLError("Redirect without a Location header.")
                    current = urljoin(current, location)
                    continue
                if response.status_code != 200:
                    raise UnsafeURLError(f"URL returned HTTP {response.status_code}.")
                served = response.headers.get("content-type", "").split(";")[0].strip().lower()
                mime = _ACCEPTED.get(served)
                if mime is None:
                    raise UnsafeURLError(f"Unsupported content type: {served or 'unknown'}.")
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > limit:
                        raise UnsafeURLError(f"Document exceeds {limit} bytes.")
            finally:
                await response.aclose()
            return _finish(bytes(body), served, mime, current)
    raise UnsafeURLError("Too many redirects.")


def _finish(body: bytes, served: str, mime: str, final_url: str) -> FetchedDocument:
    title = ""
    if served in ("text/html", "application/xhtml+xml"):
        title, text = html_to_text(body.decode("utf-8", errors="replace"))
        body = text.encode("utf-8")
        if not body.strip():
            raise UnsafeURLError("The page has no extractable text.")
    host = urlsplit(final_url).hostname or "document"
    title = (title or final_url)[:255]
    stem = re.sub(r"[^A-Za-z0-9._-]", "_", host)[:100] or "document"
    return FetchedDocument(body, mime, title, stem + _EXTENSIONS[mime], final_url)


__all__ = ["FetchedDocument", "UnsafeURLError", "fetch_url", "html_to_text"]
