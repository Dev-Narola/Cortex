import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from src.ingestion.application.reprocess import (
    ReprocessDocumentService,
    get_reprocess_document_service,
)
from src.ingestion.application.services import (
    CreateDocumentService,
    DeleteDocumentService,
    GetDocumentService,
    GetDocumentStatusService,
    ListDocumentsService,
)
from src.ingestion.infrastructure.repositories import DocumentRepository
from src.ingestion.infrastructure.s3_storage import S3Storage
from src.ingestion.interface.rest.auth import (
    _verify_ingestion_auth,
    require_document_read,
    require_document_write,
)
from src.ingestion.interface.rest.queue import arq_queue
from src.ingestion.interface.rest.schemas import (
    DocumentAcceptedResponse,
    DocumentResponse,
    DocumentStatusProgress,
    DocumentStatusResponse,
    PaginatedDocumentResponse,
)
from src.core.database import get_db

# V4 Phase 30 — audit event wiring for the document
# lifecycle (upload, access, delete). The audit log
# is append-only; a failed audit write is logged at
# CRITICAL but never re-raises (the underlying
# action has already succeeded).
from src.observability.application.audit_service import (  # noqa: E402
    AuditRecordingError,
    AuditService,
)
from src.observability.domain.entities import AuditAction  # noqa: E402
from src.observability.infrastructure.repositories import (  # noqa: E402
    AuditSqlRepository,
)
from src.identity.domain.entities import Role  # noqa: E402

router = APIRouter(prefix="/documents", tags=["documents"])


def get_document_repository(db: Session = Depends(get_db)) -> DocumentRepository:
    return DocumentRepository(db)


def get_s3_storage() -> S3Storage:
    from src.core.config import settings

    return S3Storage(
        bucket=settings.S3_BUCKET or "cortex-documents-dev-2026",
        endpoint_url=settings.S3_ENDPOINT,
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
    )


def get_create_document_service(
    repo: DocumentRepository = Depends(get_document_repository),
    storage: S3Storage = Depends(get_s3_storage),
) -> CreateDocumentService:
    return CreateDocumentService(repo, storage, queue=arq_queue)


def get_list_documents_service(
    repo: DocumentRepository = Depends(get_document_repository),
) -> ListDocumentsService:
    return ListDocumentsService(repo)


def get_get_document_service(
    repo: DocumentRepository = Depends(get_document_repository),
) -> GetDocumentService:
    return GetDocumentService(repo)


def get_delete_document_service(
    repo: DocumentRepository = Depends(get_document_repository),
    storage: S3Storage = Depends(get_s3_storage),
) -> DeleteDocumentService:
    return DeleteDocumentService(repo, storage)


def get_document_status_service(
    repo: DocumentRepository = Depends(get_document_repository),
) -> GetDocumentStatusService:
    return GetDocumentStatusService(repo)


# ---------------------------------------------------------------------------
# V4 Phase 30 — audit helpers
# ---------------------------------------------------------------------------


def _client_ip(request: Request) -> str | None:
    """Best-effort client IP extraction for the audit row.

    Reads ``X-Forwarded-For`` first (the load
    balancer / ingress is expected to set it),
    then ``request.client.host``. Returns ``None``
    if neither is available.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    if request.client is not None:
        return request.client.host
    return None


def _resolve_actor(
    request: Request,
    db: Session,
    tenant_id: uuid.UUID,
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """Return ``(actor_user_id, actor_api_key_id)`` for an audit row.

    The ``require_document_read/write`` dependency
    only returns the tenant id; we re-derive the
    actor by re-running the auth lookup against
    the request headers. For a JWT we record the
    user; for an API key we record the key; for
    a malformed request we return ``(None, None)``
    (the audit row is still useful — the operator
    can correlate by IP / timestamp).
    """
    authorization = request.headers.get("authorization")
    x_api_key = request.headers.get("x-api-key")
    try:
        ctx = _verify_ingestion_auth(
            required_scope="documents:read",
            min_role=Role.MEMBER,
            authorization=authorization,
            x_api_key=x_api_key,
            db=db,
        )
    except HTTPException:
        return (None, None)
    if ctx.id != tenant_id:
        # Defence in depth — the caller already
        # passed the tenant-id check, but if the
        # re-derived tenant differs we don't trust
        # the actor info.
        return (None, None)
    # The ``ctx`` returned by ``_verify_ingestion_auth``
    # is a ``Tenant``, not a context object. To
    # decide between "JWT" and "API key" we look
    # at the request shape: an explicit
    # ``X-API-Key`` header, or a Bearer token
    # without three dot-separated parts, means
    # the actor is the API key. A real JWT means
    # the actor is the user.
    if x_api_key:
        from src.identity.infrastructure.repositories import (
            ApiKeyRepository,
        )

        repo = ApiKeyRepository(db)
        api_key = repo.get_by_raw_key(x_api_key)
        if api_key is not None and api_key.tenant_id == tenant_id:
            return (None, api_key.id)
        return (None, None)
    if authorization:
        parts = authorization.split(None, 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1].strip()
            if len(token.split(".")) == 3:
                # JWT — decode and grab the user id.
                from src.identity.infrastructure.security import (
                    decode_access_token,
                )

                try:
                    claims = decode_access_token(token, expected_type="access")
                    user_id = uuid.UUID(str(claims["sub"]))
                    return (user_id, None)
                except Exception:
                    return (None, None)
            # API key passed as Bearer.
            from src.identity.infrastructure.repositories import (
                ApiKeyRepository,
            )

            repo = ApiKeyRepository(db)
            api_key = repo.get_by_raw_key(token)
            if api_key is not None and api_key.tenant_id == tenant_id:
                return (None, api_key.id)
    return (None, None)


def _safe_audit(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    action: AuditAction,
    actor_user_id: uuid.UUID | None = None,
    actor_api_key_id: uuid.UUID | None = None,
    resource_type: str | None = None,
    resource_id: uuid.UUID | str | None = None,
    metadata: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """Record an audit event, swallowing + logging the failure.

    See ``src.identity.interface.rest.routes`` for
    the rationale. The audit row is best-effort;
    a logging-side failure never blocks a
    privileged action that has already succeeded.
    """
    try:
        AuditService(repository=AuditSqlRepository(db)).record(
            tenant_id=tenant_id,
            action=action,
            actor_user_id=actor_user_id,
            actor_api_key_id=actor_api_key_id,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else None,
            metadata=metadata or {},
            ip_address=ip_address,
        )
    except AuditRecordingError:
        pass


@router.post("", response_model=DocumentAcceptedResponse, status_code=status.HTTP_202_ACCEPTED)
def create_document(
    request: Request,
    file: UploadFile,
    tenant_id: Annotated[uuid.UUID, Depends(require_document_write)],
    db: Session = Depends(get_db),
    service: CreateDocumentService = Depends(get_create_document_service),
):
    """
    Upload a new document for ingestion.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is missing")

    document = service.execute(
        tenant_id=tenant_id,
        created_by=tenant_id,
        filename=file.filename,
        mime_type=file.content_type or "application/octet-stream",
        file_obj=file.file,
    )
    db.commit()
    # V4 Phase 30 — document upload is a privileged
    # action. The audit row captures the actor, the
    # new document id, and the filename + size (not
    # the file content — that is never written to
    # the audit log).
    actor_user_id, actor_api_key_id = _resolve_actor(request, db, tenant_id)
    _safe_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.DOCUMENT_CREATED,
        actor_user_id=actor_user_id,
        actor_api_key_id=actor_api_key_id,
        resource_type="document",
        resource_id=document.id,
        metadata={
            "filename": file.filename,
            "mime_type": file.content_type or "application/octet-stream",
        },
        ip_address=_client_ip(request),
    )
    db.commit()
    return DocumentAcceptedResponse(
        id=document.id,
        status=document.status,
        message="Document queued for processing"
    )


@router.get("", response_model=PaginatedDocumentResponse)
def list_documents(
    tenant_id: Annotated[uuid.UUID, Depends(require_document_read)],
    limit: int = 50,
    offset: int = 0,
    service: ListDocumentsService = Depends(get_list_documents_service),
):
    """
    List all documents for the current tenant.
    """
    documents, total = service.execute(tenant_id=tenant_id, limit=limit, offset=offset)
    return PaginatedDocumentResponse(
        items=documents,  # type: ignore
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(
    request: Request,
    document_id: uuid.UUID,
    tenant_id: Annotated[uuid.UUID, Depends(require_document_read)],
    db: Session = Depends(get_db),
    service: GetDocumentService = Depends(get_get_document_service),
):
    """
    Get a specific document by ID.
    """
    document = service.execute(tenant_id=tenant_id, document_id=document_id)
    # V4 Phase 30 — document access is a privileged
    # read; the audit row lets the operator see who
    # looked at what. We commit after the audit
    # write so a logging failure doesn't block the
    # read.
    actor_user_id, actor_api_key_id = _resolve_actor(request, db, tenant_id)
    _safe_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.DOCUMENT_ACCESSED,
        actor_user_id=actor_user_id,
        actor_api_key_id=actor_api_key_id,
        resource_type="document",
        resource_id=document_id,
        ip_address=_client_ip(request),
    )
    db.commit()
    return document


@router.get("/{document_id}/status", response_model=DocumentStatusResponse)
def get_document_status(
    document_id: uuid.UUID,
    tenant_id: Annotated[uuid.UUID, Depends(require_document_read)],
    service: GetDocumentStatusService = Depends(get_document_status_service),
):
    """
    Poll the ingestion status of a specific document.

    Returns the current lifecycle stage, retry count, and error detail
    (if the document has failed). Clients should poll this endpoint
    after upload until status is 'indexed' or 'failed'.
    """
    document = service.execute(tenant_id=tenant_id, document_id=document_id)
    return DocumentStatusResponse(
        document_id=document_id,
        status=document.status,
        retry_count=document.retry_count,
        progress=DocumentStatusProgress(stage=str(document.status.value))
        if document.status not in ("pending", "indexed", "failed")
        else None,
        error=document.last_error,
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    request: Request,
    document_id: uuid.UUID,
    tenant_id: Annotated[uuid.UUID, Depends(require_document_write)],
    db: Session = Depends(get_db),
    service: DeleteDocumentService = Depends(get_delete_document_service),
):
    """
    Delete a document and its associated storage object.
    """
    service.execute(tenant_id=tenant_id, document_id=document_id)
    # V4 Phase 30 — document deletion is the
    # highest-trust action in the ingestion
    # context; the audit row is the only
    # post-hoc evidence the operator has.
    actor_user_id, actor_api_key_id = _resolve_actor(request, db, tenant_id)
    _safe_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.DOCUMENT_DELETED,
        actor_user_id=actor_user_id,
        actor_api_key_id=actor_api_key_id,
        resource_type="document",
        resource_id=document_id,
        ip_address=_client_ip(request),
    )
    db.commit()
    return None


@router.post("/{document_id}/retry", status_code=status.HTTP_202_ACCEPTED)
def retry_document(
    document_id: uuid.UUID,
    tenant_id: Annotated[uuid.UUID, Depends(require_document_write)],
    service: ReprocessDocumentService = Depends(get_reprocess_document_service),
):
    """
    Retry a FAILED document.
    Resets the document status to pending and re-queues it for background ingestion.
    """
    service.execute_retry(document_id, tenant_id=tenant_id)
    return {"message": "Document queued for retry."}


@router.post("/{document_id}/reprocess", status_code=status.HTTP_202_ACCEPTED)
def reprocess_document(
    document_id: uuid.UUID,
    tenant_id: Annotated[uuid.UUID, Depends(require_document_write)],
    service: ReprocessDocumentService = Depends(get_reprocess_document_service),
):
    """
    Force reprocess an INDEXED document.
    Bumps the document version, resets status to pending, and re-queues it.
    """
    service.execute_reprocess(document_id, tenant_id=tenant_id)
    return {"message": "Document queued for reprocessing."}
