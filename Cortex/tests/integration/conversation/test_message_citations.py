"""Saved assistant messages carry their resolved citations (title, index,
excerpt) so the UI can show sources after a reload, not only while streaming."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from src.conversation.domain.entities import Message
from src.conversation.infrastructure.repositories import ConversationMessageRepository
from src.core.database import get_db
from src.ingestion.infrastructure.models import DocumentChunkModel, DocumentModel
from src.main import app
from tests.integration.identity.test_identity_routes import (  # noqa: F401 - fixture
    _register_and_get_token,
    client,
)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _seed_chunk(db, tenant_id: uuid.UUID, user_id: uuid.UUID, title: str, text: str) -> uuid.UUID:
    now = datetime.now(UTC)
    doc = DocumentModel(
        id=uuid.uuid4(), tenant_id=tenant_id, created_by=user_id, title=title, source_type="upload",
        status="indexed", mime_type="text/plain", storage_uri="s3://b/k", created_at=now,
    )
    db.add(doc)
    db.flush()
    chunk = DocumentChunkModel(
        id=uuid.uuid4(), document_id=doc.id, tenant_id=tenant_id, content=text, chunk_index=3,
        token_count=5, chunk_metadata={}, created_at=now,
    )
    db.add(chunk)
    db.flush()
    return chunk.id


def test_messages_include_resolved_citations_in_order(client):  # noqa: F811
    token = _register_and_get_token(client)
    me = client.get("/api/v1/users/me", headers=_auth(token)).json()
    tenant_id, user_id = uuid.UUID(me["tenant_id"]), uuid.UUID(me["id"])
    conv_id = client.post("/api/v1/conversations", json={"title": "c"}, headers=_auth(token)).json()["id"]

    other_token = _register_and_get_token(client, slug="other", email="o@x.com")
    other = client.get("/api/v1/users/me", headers=_auth(other_token)).json()

    db = next(app.dependency_overrides[get_db]())
    first = _seed_chunk(db, tenant_id, user_id, "Guide.md", "Hybrid search fuses BM25 and vectors.")
    second = _seed_chunk(db, tenant_id, user_id, "Runbook.md", "Rerank with an LLM.")
    foreign = _seed_chunk(db, uuid.UUID(other["tenant_id"]), uuid.UUID(other["id"]), "Secret.md", "x")
    missing = uuid.uuid4()  # e.g. the document was deleted
    ConversationMessageRepository(db).append(
        Message.create(
            conversation_id=uuid.UUID(conv_id), tenant_id=tenant_id, role="assistant",
            content="Fused [1], reranked [2].",
            retrieved_chunk_ids=[second, missing, first, foreign],
        )
    )
    db.commit()

    for url in (f"/api/v1/conversations/{conv_id}/messages", f"/api/v1/conversations/{conv_id}"):
        body = client.get(url, headers=_auth(token)).json()
        messages = body if isinstance(body, list) else body["messages"]
        cites = messages[-1]["citations"]
        # Same order as retrieved_chunk_ids; deleted and other-tenant chunks are dropped.
        assert [c["chunk_id"] for c in cites] == [str(second), str(first)]
        assert cites[0]["document_title"] == "Runbook.md"
        assert cites[1]["excerpt"] == "Hybrid search fuses BM25 and vectors."
        assert cites[1]["chunk_index"] == 3
