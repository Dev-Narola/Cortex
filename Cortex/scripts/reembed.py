"""
Re-enqueue embedding for every document whose chunks lack vectors.

Run after migration w1_embedding_halfvec_2048 (which clears vectors made by
the retired model and moves their documents to 'embedding'), or any time an
embedding run was lost:

    docker exec cortex-worker python scripts/reembed.py [--dry-run]

Idempotent: embed_chunks_task only embeds chunks whose vector is NULL, and
each job id is unique per document so a re-run doesn't double-queue.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from arq import create_pool  # noqa: E402
from arq.connections import RedisSettings  # noqa: E402
from sqlalchemy import text  # noqa: E402

from src.core.config import settings  # noqa: E402
from src.core.database import SessionLocal  # noqa: E402

_PENDING = text(
    "SELECT DISTINCT d.id, d.tenant_id FROM documents d "
    "JOIN document_chunks c ON c.document_id = d.id "
    "WHERE c.embedding IS NULL AND d.status = 'embedding'"
)


async def main(dry_run: bool) -> int:
    with SessionLocal() as db:
        rows = db.execute(_PENDING).all()
    print(f"{len(rows)} document(s) need embeddings")
    if dry_run or not rows:
        return 0
    pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    try:
        for doc_id, tenant_id in rows:
            job = await pool.enqueue_job(
                "embed_chunks_task",
                document_id=str(doc_id),
                tenant_id=str(tenant_id),
                _job_id=f"reembed:{doc_id}",
            )
            print(f"  {doc_id}: {'queued' if job else 'already queued'}")
    finally:
        await pool.close()
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--dry-run", action="store_true")
    sys.exit(asyncio.run(main(parser.parse_args().dry_run)))
