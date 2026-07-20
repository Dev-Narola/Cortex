"""
Unit tests for main application.
"""

import pytest
from fastapi.testclient import TestClient

from src.main import app


def test_app_create():
    """Test that the app creates successfully."""
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to Cortex API"}


if __name__ == "__main__":
    pytest.main([__file__])
