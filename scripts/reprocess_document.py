"""
Script to reprocess a single document.
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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Reprocess a specific document.")
    parser.add_argument("document_id", type=uuid.UUID, help="The Document UUID")
    parser.add_argument("tenant_id", type=uuid.UUID, help="The Tenant UUID")
    parser.add_argument(
        "--retry",
        action="store_true",
        help="Use this flag if the document is FAILED (retry) instead of INDEXED (reprocess)",
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

            if args.retry:
                logger.info(f"Retrying FAILED document {args.document_id} (tenant: {args.tenant_id})")
                service.execute_retry(args.document_id, tenant_id=args.tenant_id)
            else:
                logger.info(f"Reprocessing INDEXED document {args.document_id} (tenant: {args.tenant_id})")
                service.execute_reprocess(args.document_id, tenant_id=args.tenant_id)
            
            session.commit()
            logger.info("Successfully queued document.")
            
    except Exception as e:
        logger.error(f"Failed to queue document: {e}")
        sys.exit(1)
    finally:
        await close_redis()


if __name__ == "__main__":
    asyncio.run(main())
