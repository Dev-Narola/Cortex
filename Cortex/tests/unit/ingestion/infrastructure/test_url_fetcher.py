"""URL ingestion SSRF guard and extraction (audit H7)."""

from __future__ import annotations

import asyncio

import httpx
import pytest

from src.ingestion.infrastructure.url_fetcher import UnsafeURLError, fetch_url, html_to_text

PUBLIC_IP = "93.184.216.34"


def _resolver(mapping: dict[str, list[str]]):
    async def resolve(host: str, port: int) -> list[str]:
        return mapping[host]

    return resolve


def _fetch(url, *, mapping=None, handler=None):
    transport = httpx.MockTransport(handler or (lambda r: httpx.Response(200)))
    return asyncio.run(
        fetch_url(url, resolver=_resolver(mapping or {}), transport=transport)
    )


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://example.com/x",
        "http://user:pw@example.com/",
        "http://example.com:8080/",
        "gopher://example.com/",
    ],
)
def test_rejects_unsafe_url_shapes(url):
    with pytest.raises(UnsafeURLError):
        _fetch(url, mapping={"example.com": [PUBLIC_IP]})


@pytest.mark.parametrize(
    "addresses",
    [
        ["127.0.0.1"],
        ["169.254.169.254"],  # cloud metadata
        ["10.0.0.5"],
        ["172.16.3.4"],
        ["192.168.1.1"],
        ["100.64.0.1"],  # CGNAT
        ["::1"],
        ["fd00::1"],
        ["::ffff:10.0.0.1"],  # IPv4-mapped private
        [PUBLIC_IP, "10.0.0.5"],  # any unsafe address taints the host
    ],
)
def test_rejects_private_and_metadata_addresses(addresses):
    with pytest.raises(UnsafeURLError):
        _fetch("https://evil.test/", mapping={"evil.test": addresses})


def test_fetches_html_pinned_to_vetted_ip_and_extracts_text():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["host"] = request.url.host
        seen["header"] = request.headers["host"]
        html = (
            "<html><head><title>Cortex Docs</title><script>steal()</script></head>"
            "<body><h1>Intro</h1><p>Cortex uses pgvector.</p><style>p{}</style></body></html>"
        )
        return httpx.Response(200, headers={"content-type": "text/html; charset=utf-8"}, text=html)

    doc = _fetch("https://docs.example.com/intro", mapping={"docs.example.com": [PUBLIC_IP]},
                 handler=handler)
    assert seen == {"host": PUBLIC_IP, "header": "docs.example.com"}
    assert doc.mime_type == "text/plain" and doc.title == "Cortex Docs"
    text = doc.content.decode()
    assert "Cortex uses pgvector." in text and "steal" not in text and "p{}" not in text
    assert doc.filename.endswith(".txt")


def test_redirect_into_private_space_is_blocked():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://internal.test/admin"})

    with pytest.raises(UnsafeURLError):
        _fetch("http://public.test/", handler=handler,
               mapping={"public.test": [PUBLIC_IP], "internal.test": ["10.1.2.3"]})


def test_too_many_redirects():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(301, headers={"location": "http://public.test/again"})

    with pytest.raises(UnsafeURLError, match="redirects"):
        _fetch("http://public.test/", handler=handler, mapping={"public.test": [PUBLIC_IP]})


def test_size_cap_and_unsupported_type(monkeypatch):
    from src.core.config import settings

    monkeypatch.setattr(settings, "MAX_DOCUMENT_SIZE_BYTES", 10)
    big = lambda r: httpx.Response(200, headers={"content-type": "text/plain"}, content=b"x" * 11)  # noqa: E731
    with pytest.raises(UnsafeURLError, match="exceeds"):
        _fetch("https://a.test/", handler=big, mapping={"a.test": [PUBLIC_IP]})
    exe = lambda r: httpx.Response(200, headers={"content-type": "application/x-msdownload"})  # noqa: E731
    with pytest.raises(UnsafeURLError, match="Unsupported"):
        _fetch("https://a.test/", handler=exe, mapping={"a.test": [PUBLIC_IP]})


def test_html_to_text_collapses_whitespace():
    title, text = html_to_text("<title> T </title><div>a</div>\n\n\n<div>b   c</div>")
    assert title == "T" and text == "a\n\nb c"
