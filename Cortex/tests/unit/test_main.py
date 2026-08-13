"""
Unit tests for main application.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.main import app, global_exception_handler


def test_app_create():
    """Test that the app creates successfully."""
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to Cortex API"}


# ---------------------------------------------------------------------------
# V11.5 — global exception handler CORS coverage
# ---------------------------------------------------------------------------
# The default ``@app.exception_handler(Exception)`` returns a
# ``JSONResponse`` that, in some Starlette/FastAPI middleware
# orderings, reaches the browser WITHOUT the
# ``Access-Control-Allow-Origin`` header. The browser then
# misreports the 500 as ``blocked by CORS policy``, hiding
# the real stack trace from the operator. The handler we
# ship mirrors the CORS settings on the response so a
# server-side 500 always reaches the browser as a server
# error. The tests below pin the contract.
# ---------------------------------------------------------------------------


def _build_isolated_app() -> FastAPI:
    """Build a minimal FastAPI app with the same exception
    handler as production.

    The test app has no routes — we drive the handler
    directly by raising in a one-off endpoint. The handler
    is the one wired in :mod:`src.main`, so the behaviour
    is identical to production.
    """
    test_app = FastAPI()
    # Re-register the production handler. The FastAPI
    # decorator syntax keeps the same behaviour; we just
    # point it at a different app instance so the test
    # doesn't need the full CORS / DB middleware stack.
    test_app.add_exception_handler(Exception, global_exception_handler)

    @test_app.get("/boom")
    def _boom() -> None:
        raise RuntimeError("kaboom")

    return test_app


def test_global_exception_handler_returns_500():
    """An unhandled exception produces a 500 with the
    standard ``{code, message, data}`` envelope."""
    client = TestClient(_build_isolated_app(), raise_server_exceptions=False)
    response = client.get("/boom")
    assert response.status_code == 500
    body = response.json()
    assert body == {"code": 500, "message": "Internal Server Error", "data": None}


def test_global_exception_handler_echoes_request_origin():
    """The handler sets ``Access-Control-Allow-Origin`` to
    the request's ``Origin`` so a 500 from a browser fetch
    is reported as a server error, not a CORS failure."""
    client = TestClient(_build_isolated_app(), raise_server_exceptions=False)
    response = client.get("/boom", headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 500
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
    # Credentials must be advertised so the browser
    # forwards cookies on the subsequent retry.
    assert response.headers.get("access-control-allow-credentials") == "true"
    # And ``Vary: Origin`` so caches don't serve the
    # response to a different origin.
    assert "Origin" in response.headers.get("vary", "")


def test_global_exception_handler_falls_back_to_wildcard_when_no_origin():
    """A request without an ``Origin`` header (curl, a
    server-to-server probe) still gets a usable CORS
    response — the wildcard keeps it broadly compatible."""
    client = TestClient(_build_isolated_app(), raise_server_exceptions=False)
    response = client.get("/boom")
    assert response.status_code == 500
    assert response.headers.get("access-control-allow-origin") == "*"


if __name__ == "__main__":
    pytest.main([__file__])
