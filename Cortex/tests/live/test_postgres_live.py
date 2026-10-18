"""
Live Postgres + pgvector checks (run in CI after ``alembic upgrade head``;
``pytest -m live_infra``). They exercise what SQLite can't: the migrated
schema, halfvec HNSW search, the tsvector trigger, and the audit trigger.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from src.core.database import AsyncSessionLocal, SessionLocal
from src.identity.infrastructure.models import TenantModel, UserModel
from src.identity.infrastructure.security import hash_password
from src.ingestion.infrastructure.models import EMBEDDING_DIM, DocumentChunkModel, DocumentModel
from src.retrieval.application.query.hybrid_search import HybridSearchService
from src.retrieval.application.query.rerank_service import RerankerService
from src.retrieval.infrastructure.query.full_text_search_repository import FullTextSearchRepository
from src.retrieval.infrastructure.query.vector_search_repository import VectorSearchRepository
from src.retrieval.infrastructure.reranker import IdentityReranker

pytestmark = pytest.mark.live_infra


def _unit(i: int) -> list[float]:
    v = [0.0] * EMBEDDING_DIM
    v[i] = 1.0
    return v


@pytest.fixture
def db():
    s = SessionLocal()
    yield s
    s.rollback()
    s.close()


def _tenant(db) -> tuple[uuid.UUID, uuid.UUID]:
    now = datetime.now(UTC)
    t = TenantModel(name="T", slug=f"t-{uuid.uuid4().hex[:12]}", created_at=now, updated_at=now)
    db.add(t)
    db.flush()
    u = UserModel(
        tenant_id=t.id,
        email=f"{uuid.uuid4().hex[:8]}@x.com",
        password_hash=hash_password("x-test-password"),
        role="owner",
        created_at=now,
        updated_at=now,
    )
    db.add(u)
    db.commit()
    return t.id, u.id


def _chunk(db, tenant_id, user_id, content, embedding) -> uuid.UUID:
    now = datetime.now(UTC)
    d = DocumentModel(
        tenant_id=tenant_id,
        created_by=user_id,
        title=content[:20],
        source_type="upload",
        status="indexed",
        mime_type="text/plain",
        storage_uri="s3://b/k",
        created_at=now,
    )
    db.add(d)
    db.flush()
    c = DocumentChunkModel(
        document_id=d.id,
        tenant_id=tenant_id,
        content=content,
        chunk_index=0,
        token_count=5,
        chunk_metadata={},
        created_at=now,
        embedding=embedding,
    )
    db.add(c)
    db.commit()
    return c.id


def test_schema_is_at_head(db):
    emb = db.execute(text(
        "select format_type(atttypid, atttypmod) from pg_attribute "
        "where attrelid = 'document_chunks'::regclass and attname = 'embedding'"
    )).scalar_one()
    assert emb == f"halfvec({EMBEDDING_DIM})"
    cols = {r[0] for r in db.execute(text(
        "select table_name || '.' || column_name from information_schema.columns "
        "where column_name in ('key_lookup', 'summarized_through')"
    ))}
    assert cols == {"api_keys.key_lookup", "conversations.summarized_through"}


def test_audit_log_is_append_only(db):
    tenant_id, _ = _tenant(db)
    row_id = db.execute(text(
        "insert into audit_log (id, tenant_id, action, metadata_json, created_at) "
        "values (:id, :t, 'document_accessed', '{}', now()) returning id"
    ), {"id": uuid.uuid4(), "t": tenant_id}).scalar_one()
    db.commit()
    for stmt in ("update audit_log set action = 'x' where id = :id",
                 "delete from audit_log where id = :id"):
        with pytest.raises(DBAPIError, match="append-only"):
            db.execute(text(stmt), {"id": row_id})
        db.rollback()


async def test_hybrid_search_is_tenant_scoped_and_ranked(db):
    a, a_user = _tenant(db)
    b, b_user = _tenant(db)
    hit = _chunk(db, a, a_user, "pgvector stores halfvec embeddings", _unit(0))
    _chunk(db, a, a_user, "bananas are yellow fruit", _unit(1))
    _chunk(db, a, a_user, "chunk still being embedded pgvector", None)
    secret = _chunk(db, b, b_user, "pgvector secret of tenant b", _unit(0))

    embed = AsyncMock()
    embed.embed_query = AsyncMock(return_value=_unit(0))
    async with AsyncSessionLocal() as s:
        svc = HybridSearchService(
            query_embed_service=embed,
            vector_repo=VectorSearchRepository(s),
            fts_repo=FullTextSearchRepository(s),
            reranker=RerankerService(IdentityReranker()),
            use_cache=False,
        )
        results = await svc.search(a, "pgvector embeddings")

    ids = [r.chunk_id for r in results]
    assert ids[0] == hit  # top in both vector and keyword lists
    assert secret not in ids and all(r.tenant_id == a for r in results)
