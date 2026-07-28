"""
Script to reprocess all documents for a tenant.
"""

import argparse
import asyncio
import logging
import sys
import uuid

from src.ingestion.application.reprocess import ReprocessDocumentService
from src.ingestion.application.status_transition import DocumentStatusTransitionService
from src.ingestion.infrastructure.repositories import DocumentRepository
from src.ingestion.interface.rest.queue import ArqQueue
from src.core.database import session_factory
from src.core.redis_client import close_redis, init_redis
from src.ingestion.domain.entities import DocumentStatus

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Reprocess all documents for a specific tenant.")
    parser.add_argument("tenant_id", type=uuid.UUID, help="The Tenant UUID")
    parser.add_argument(
        "--retry",
        action="store_true",
        help="Use this flag to only retry FAILED documents. Otherwise reprocesses INDEXED documents.",
    )

    args = parser.parse_args()

    # Initialize async resources
    await init_redis()
    
    try:
        # Use sync db session
        with session_factory() as session:
            repository = DocumentRepository(session)
            transition_service = DocumentStatusTransitionService(repository)
            queue = ArqQueue()
            
            service = ReprocessDocumentService(
                repository=repository,
                transition_service=transition_service,
                queue=queue,
            )

            # Paginate through tenant documents
            limit = 100
            offset = 0
            processed = 0

            while True:
                docs = repository.list(args.tenant_id, limit=limit, offset=offset)
                if not docs:
                    break

                for doc in docs:
                    try:
                        if args.retry and doc.status == DocumentStatus.FAILED:
                            logger.info(f"Retrying FAILED document {doc.id}")
                            service.execute_retry(doc.id, tenant_id=args.tenant_id)
                            processed += 1
                        elif not args.retry and doc.status == DocumentStatus.INDEXED:
                            logger.info(f"Reprocessing INDEXED document {doc.id}")
                            service.execute_reprocess(doc.id, tenant_id=args.tenant_id)
                            processed += 1
                    except Exception as e:
                        logger.error(f"Failed to queue document {doc.id}: {e}")
                
                offset += limit

            session.commit()
            logger.info(f"Successfully queued {processed} documents.")
            
    except Exception as e:
        logger.error(f"Failed to queue documents: {e}")
        sys.exit(1)
    finally:
        await close_redis()


if __name__ == "__main__":
    asyncio.run(main())
