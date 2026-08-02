"""
Pure-Python domain entities for the conversation bounded context.

Three entities:

* ``Conversation``  — a thread owned by a single user inside a tenant.
* ``Message``       — one turn inside a conversation.
* ``Citation``      — a single source backing a citation marker in an
  assistant message.

Per the project's hexagonal layout, no entity in this file imports
from FastAPI, SQLAlchemy, or any infrastructure concern. The business
rules enforced here must hold in unit tests exactly as they hold in
production.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import ClassVar

from src.shared.exceptions import NotFoundException, ValidationException


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class MessageRole(str, Enum):  # noqa: UP042 - intentional str-Enum for JSON
    """
    Role a message plays in a conversation.

    V3 supports ``user`` / ``assistant`` / ``system``. ``tool`` is
    reserved for V6 (agentic tool calling) and lives in the same
    enum so the persistence layer can already accept the value —
    a real production deployment just needs to flip the check.
    """

    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"  # V6-only


# ---------------------------------------------------------------------------
# Citation
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Citation:
    """
    A single source backing a citation in an assistant message.

    ``frozen=True`` so a citation is immutable once it leaves the
    RAG service. ``document_id`` and ``chunk_id`` together let the
    UI render a deep-link to the exact excerpt; ``document_title``
    and ``chunk_index`` are kept on the citation so the response
    payload is self-contained (no extra round-trip).
    """

    document_id: uuid.UUID
    chunk_id: uuid.UUID
    document_title: str
    chunk_index: int
    # Optional relevance score so the response can sort citations
    # by how strongly they support the answer. Populated by the
    # search service; zero for fallback (no reranker / fused) results.
    score: float = 0.0
    # Short excerpt of the cited chunk, for the side panel. Optional
    # so existing call sites that don't extract it keep working.
    excerpt: str | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.document_id, uuid.UUID):
            raise ValidationException(
                message="Citation document_id must be a UUID.",
                code=400,
                data={"field": "document_id"},
            )
        if not isinstance(self.chunk_id, uuid.UUID):
            raise ValidationException(
                message="Citation chunk_id must be a UUID.",
                code=400,
                data={"field": "chunk_id"},
            )
        if not isinstance(self.chunk_index, int) or self.chunk_index < 0:
            raise ValidationException(
                message="Citation chunk_index must be a non-negative integer.",
                code=400,
                data={"field": "chunk_index"},
            )
        if not self.document_title or not self.document_title.strip():
            raise ValidationException(
                message="Citation document_title must be a non-empty string.",
                code=400,
                data={"field": "document_title"},
            )

    def to_dict(self) -> dict:
        return {
            "document_id": str(self.document_id),
            "chunk_id": str(self.chunk_id),
            "document_title": self.document_title,
            "chunk_index": self.chunk_index,
            "score": self.score,
            "excerpt": self.excerpt,
        }


# ---------------------------------------------------------------------------
# Message
# ---------------------------------------------------------------------------


@dataclass(eq=False)
class Message:
    """
    One turn inside a conversation.

    Business rules:

    * ``role`` is one of the documented ``MessageRole`` values.
    * ``content`` is a non-empty string.
    * ``conversation_id`` and ``tenant_id`` are UUIDs and agree
      (the message belongs to the same tenant as its parent
      conversation).
    * ``token_count`` is ``>= 0``.
    * ``retrieved_chunk_ids`` is the list of chunk UUIDs the RAG
      pipeline retrieved and used to ground the answer; the
      ``Citation`` list is derived from this in the application
      layer. The IDs themselves are not validated here — that's
      the citation-validation step in the answer service.
    """

    conversation_id: uuid.UUID
    tenant_id: uuid.UUID
    role: MessageRole | str
    content: str
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    token_count: int = 0
    retrieved_chunk_ids: list[uuid.UUID] = field(default_factory=list)
    model_name: str | None = None
    cost_usd: float | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    _CONTENT_MIN_LENGTH: ClassVar[int] = 1
    _CONTENT_MAX_LENGTH: ClassVar[int] = 64_000  # generous; the LLM caps it

    # ---------- factory helpers ----------

    @classmethod
    def create(
        cls,
        *,
        conversation_id: uuid.UUID,
        tenant_id: uuid.UUID,
        role: MessageRole | str,
        content: str,
        token_count: int = 0,
        retrieved_chunk_ids: list[uuid.UUID] | None = None,
        model_name: str | None = None,
        cost_usd: float | None = None,
    ) -> Message:
        return cls(
            conversation_id=conversation_id,
            tenant_id=tenant_id,
            role=role,  # type: ignore[arg-type]
            content=content,
            token_count=token_count,
            retrieved_chunk_ids=list(retrieved_chunk_ids or []),
            model_name=model_name,
            cost_usd=cost_usd,
        )

    @classmethod
    def from_persistence(
        cls,
        *,
        id: uuid.UUID,
        conversation_id: uuid.UUID,
        tenant_id: uuid.UUID,
        role: MessageRole | str,
        content: str,
        token_count: int,
        retrieved_chunk_ids: list[uuid.UUID],
        model_name: str | None,
        cost_usd: float | None,
        created_at: datetime,
    ) -> Message:
        """Reconstruct a Message from a persistence-layer row."""
        instance = object.__new__(cls)
        object.__setattr__(instance, "id", id)
        object.__setattr__(
            instance, "conversation_id", cls._validate_uuid(conversation_id, field="conversation_id")
        )
        object.__setattr__(
            instance, "tenant_id", cls._validate_uuid(tenant_id, field="tenant_id")
        )
        object.__setattr__(instance, "role", cls._validate_role(role))
        object.__setattr__(
            instance, "content", cls._validate_content(content)
        )
        object.__setattr__(
            instance,
            "token_count",
            cls._validate_non_negative_int(token_count, field="token_count"),
        )
        object.__setattr__(
            instance,
            "retrieved_chunk_ids",
            [cls._validate_uuid(cid, field="retrieved_chunk_id") for cid in retrieved_chunk_ids],
        )
        object.__setattr__(instance, "model_name", model_name)
        object.__setattr__(instance, "cost_usd", cost_usd)
        object.__setattr__(instance, "created_at", cls._validate_timestamp(created_at))
        return instance

    # ---------- validation ----------

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "conversation_id",
            self._validate_uuid(self.conversation_id, field="conversation_id"),
        )
        object.__setattr__(
            self, "tenant_id", self._validate_uuid(self.tenant_id, field="tenant_id")
        )
        object.__setattr__(self, "role", self._validate_role(self.role))
        object.__setattr__(self, "content", self._validate_content(self.content))
        object.__setattr__(
            self, "token_count",
            self._validate_non_negative_int(self.token_count, field="token_count"),
        )
        # ``retrieved_chunk_ids`` is a list — defensive copy and
        # element validation. Each element is a UUID.
        object.__setattr__(
            self,
            "retrieved_chunk_ids",
            [self._validate_uuid(cid, field="retrieved_chunk_id") for cid in (self.retrieved_chunk_ids or [])],
        )
        object.__setattr__(self, "created_at", self._validate_timestamp(self.created_at))

    @staticmethod
    def _validate_uuid(value: uuid.UUID, *, field: str) -> uuid.UUID:
        if not isinstance(value, uuid.UUID):
            raise ValidationException(
                message=f"Message {field} must be a UUID.",
                code=400,
                data={"field": field},
            )
        return value

    @staticmethod
    def _validate_role(role: MessageRole | str) -> MessageRole:
        if isinstance(role, MessageRole):
            return role
        if isinstance(role, str):
            try:
                return MessageRole(role)
            except ValueError as exc:
                raise ValidationException(
                    message=(
                        f"Invalid message role '{role}'. Must be one of: "
                        f"{', '.join(r.value for r in MessageRole)}."
                    ),
                    code=400,
                    data={"field": "role", "value": role},
                ) from exc
        raise ValidationException(
            message="Message role must be a MessageRole enum value or a valid role string.",
            code=400,
            data={"field": "role"},
        )

    @staticmethod
    def _validate_content(content: str) -> str:
        if not isinstance(content, str):
            raise ValidationException(
                message="Message content must be a string.",
                code=400,
                data={"field": "content"},
            )
        if len(content) < Message._CONTENT_MIN_LENGTH:
            raise ValidationException(
                message="Message content cannot be empty.",
                code=400,
                data={"field": "content"},
            )
        if len(content) > Message._CONTENT_MAX_LENGTH:
            raise ValidationException(
                message=(
                    f"Message content cannot exceed "
                    f"{Message._CONTENT_MAX_LENGTH} characters."
                ),
                code=400,
                data={
                    "field": "content",
                    "max_length": Message._CONTENT_MAX_LENGTH,
                },
            )
        return content

    @staticmethod
    def _validate_non_negative_int(value: int, *, field: str) -> int:
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise ValidationException(
                message=f"Message {field} must be a non-negative integer.",
                code=400,
                data={"field": field},
            )
        return value

    @staticmethod
    def _validate_timestamp(value: datetime) -> datetime:
        if not isinstance(value, datetime):
            raise ValidationException(
                message="Message created_at must be a datetime.",
                code=400,
                data={"field": "created_at"},
            )
        if value.tzinfo is None:
            raise ValidationException(
                message="Message created_at must be timezone-aware.",
                code=400,
                data={"field": "created_at"},
            )
        return value

    # ---------- identity ----------

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Message):
            return NotImplemented
        return self.id == other.id

    def __hash__(self) -> int:
        return hash(self.id)


# ---------------------------------------------------------------------------
# Conversation
# ---------------------------------------------------------------------------


@dataclass(eq=False)
class Conversation:
    """
    A chat thread inside a tenant.

    Business rules:

    * ``tenant_id`` and ``user_id`` are UUIDs.
    * ``title`` is non-empty (the V3 service auto-generates it from
      the first user message; callers can rename later).
    * ``summary`` is optional and has a length cap to keep the
      ContextWindowManager's accounting honest.
    * ``created_at`` and ``updated_at`` are timezone-aware.
    * ``updated_at`` is bumped automatically by any mutating method.
    """

    tenant_id: uuid.UUID
    user_id: uuid.UUID
    title: str
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    summary: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    _TITLE_MAX_LENGTH: ClassVar[int] = 512
    _SUMMARY_MAX_LENGTH: ClassVar[int] = 2048

    # ---------- factory ----------

    @classmethod
    def create(
        cls,
        *,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        title: str,
        summary: str | None = None,
    ) -> Conversation:
        now = datetime.now(UTC)
        return cls(
            tenant_id=tenant_id,
            user_id=user_id,
            title=title,
            summary=summary,
            created_at=now,
            updated_at=now,
        )

    @classmethod
    def from_persistence(
        cls,
        *,
        id: uuid.UUID,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        title: str,
        summary: str | None,
        created_at: datetime,
        updated_at: datetime,
    ) -> Conversation:
        instance = object.__new__(cls)
        object.__setattr__(instance, "id", id)
        object.__setattr__(
            instance, "tenant_id", cls._validate_uuid(tenant_id, field="tenant_id")
        )
        object.__setattr__(
            instance, "user_id", cls._validate_uuid(user_id, field="user_id")
        )
        object.__setattr__(instance, "title", cls._validate_title(title))
        object.__setattr__(
            instance, "summary", cls._validate_summary(summary)
        )
        object.__setattr__(
            instance, "created_at", cls._validate_timestamp(created_at)
        )
        object.__setattr__(
            instance, "updated_at", cls._validate_timestamp(updated_at)
        )
        cls._validate_timestamp_order(created_at, updated_at)
        return instance

    # ---------- validation ----------

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "tenant_id", self._validate_uuid(self.tenant_id, field="tenant_id")
        )
        object.__setattr__(
            self, "user_id", self._validate_uuid(self.user_id, field="user_id")
        )
        object.__setattr__(self, "title", self._validate_title(self.title))
        object.__setattr__(self, "summary", self._validate_summary(self.summary))
        object.__setattr__(
            self, "created_at", self._validate_timestamp(self.created_at)
        )
        object.__setattr__(
            self, "updated_at", self._validate_timestamp(self.updated_at)
        )
        self._validate_timestamp_order(self.created_at, self.updated_at)

    @staticmethod
    def _validate_uuid(value: uuid.UUID, *, field: str) -> uuid.UUID:
        if not isinstance(value, uuid.UUID):
            raise ValidationException(
                message=f"Conversation {field} must be a UUID.",
                code=400,
                data={"field": field},
            )
        return value

    @staticmethod
    def _validate_title(title: str) -> str:
        if not isinstance(title, str):
            raise ValidationException(
                message="Conversation title must be a string.",
                code=400,
                data={"field": "title"},
            )
        cleaned = title.strip()
        if not cleaned:
            raise ValidationException(
                message="Conversation title cannot be empty.",
                code=400,
                data={"field": "title"},
            )
        if len(cleaned) > Conversation._TITLE_MAX_LENGTH:
            raise ValidationException(
                message=(
                    f"Conversation title cannot exceed "
                    f"{Conversation._TITLE_MAX_LENGTH} characters."
                ),
                code=400,
                data={"field": "title", "max_length": Conversation._TITLE_MAX_LENGTH},
            )
        return cleaned

    @staticmethod
    def _validate_summary(summary: str | None) -> str | None:
        if summary is None:
            return None
        if not isinstance(summary, str):
            raise ValidationException(
                message="Conversation summary must be a string when present.",
                code=400,
                data={"field": "summary"},
            )
        cleaned = summary.strip()
        if not cleaned:
            return None
        if len(cleaned) > Conversation._SUMMARY_MAX_LENGTH:
            raise ValidationException(
                message=(
                    f"Conversation summary cannot exceed "
                    f"{Conversation._SUMMARY_MAX_LENGTH} characters."
                ),
                code=400,
                data={"field": "summary", "max_length": Conversation._SUMMARY_MAX_LENGTH},
            )
        return cleaned

    @staticmethod
    def _validate_timestamp(value: datetime) -> datetime:
        if not isinstance(value, datetime):
            raise ValidationException(
                message="Conversation timestamp must be a datetime.",
                code=400,
                data={"field": "created_at"},
            )
        if value.tzinfo is None:
            raise ValidationException(
                message="Conversation timestamp must be timezone-aware.",
                code=400,
                data={"field": "created_at"},
            )
        return value

    @staticmethod
    def _validate_timestamp_order(created_at: datetime, updated_at: datetime) -> None:
        if updated_at < created_at:
            raise ValidationException(
                message="updated_at cannot be earlier than created_at.",
                code=400,
                data={"field": "updated_at"},
            )

    # ---------- mutators ----------

    def _touch(self) -> None:
        object.__setattr__(self, "updated_at", datetime.now(UTC))

    def rename(self, new_title: str) -> None:
        object.__setattr__(self, "title", self._validate_title(new_title))
        self._touch()

    def set_summary(self, new_summary: str | None) -> None:
        object.__setattr__(self, "summary", self._validate_summary(new_summary))
        self._touch()

    # ---------- identity ----------

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Conversation):
            return NotImplemented
        return self.id == other.id

    def __hash__(self) -> int:
        return hash(self.id)


__all__ = ["Citation", "Conversation", "Message", "MessageRole"]

# Re-export the shared NotFoundException so callers can ``from
# src.conversation.domain.entities import NotFoundException`` if
# they prefer a single import. No-op when already imported.
_ = NotFoundException
