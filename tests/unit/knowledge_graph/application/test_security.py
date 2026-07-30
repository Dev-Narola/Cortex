"""
Unit tests for the V7 Knowledge Graph security policy.

Covers the Phase 10 spec rules:

* Rule 1 — Tenant A cannot read Tenant B's graph
  (403 Forbidden).
* Rule 2 — Only owner / admin can trigger
  extraction (member / viewer → 403).
* Rule 3 — GraphQL security: every resolver
  internally applies ``current_user.tenant_id``.
  The rule is enforced at the resolver level
  (covered by the GraphQL integration tests) and
  is asserted here indirectly: the policy is the
  one place the role check is written.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from src.knowledge_graph.application.security import (
    EXTRACTION_ROLES,
    GraphSecurityPolicy,
    require_extraction_role,
)
from src.shared.exceptions import (
    ForbiddenException,
    UnauthorizedException,
    ValidationException,
)


def _make_user(
    *,
    tenant_id: uuid.UUID,
    role: str = "owner",
    is_active: bool = True,
) -> "object":
    """Build a minimal User for the policy tests.

    The full ``User`` dataclass lives in
    :mod:`src.identity.domain.entities` and has
    a strict constructor that requires a real
    bcrypt hash. The policy only reads
    ``tenant_id`` and ``role``, so we use
    :meth:`User.create` (which accepts a plain
    password) instead of the raw constructor.
    """
    from src.identity.domain.entities import User
    from src.identity.infrastructure.security import hash_password

    return User.create(
        tenant_id=tenant_id,
        email="test@example.com",
        full_name="Test",
        hashed_password=hash_password("x"),
        role=role,
        is_active=is_active,
    )


class TestGraphSecurityPolicy:
    """Tests for the :class:`GraphSecurityPolicy` class."""

    def test_assert_can_access_same_tenant_succeeds(self):
        tenant_id = uuid.uuid4()
        user = _make_user(tenant_id=tenant_id, role="owner")
        # No exception
        GraphSecurityPolicy().assert_can_access(
            user=user, target_tenant_id=tenant_id
        )

    def test_assert_can_access_cross_tenant_raises_403(self):
        user = _make_user(tenant_id=uuid.uuid4(), role="owner")
        other_tenant = uuid.uuid4()
        with pytest.raises(ForbiddenException) as exc:
            GraphSecurityPolicy().assert_can_access(
                user=user, target_tenant_id=other_tenant
            )
        assert exc.value.code == 403
        assert "another tenant" in exc.value.message

    def test_assert_can_access_missing_user_raises_401(self):
        with pytest.raises(UnauthorizedException):
            GraphSecurityPolicy().assert_can_access(
                user=None,  # type: ignore[arg-type]
                target_tenant_id=uuid.uuid4(),
            )

    def test_assert_can_access_invalid_target_raises_400(self):
        user = _make_user(tenant_id=uuid.uuid4())
        with pytest.raises(ValidationException):
            GraphSecurityPolicy().assert_can_access(
                user=user,
                target_tenant_id="not-a-uuid",  # type: ignore[arg-type]
            )

    def test_assert_can_extract_owner_succeeds(self):
        tenant_id = uuid.uuid4()
        user = _make_user(tenant_id=tenant_id, role="owner")
        GraphSecurityPolicy().assert_can_extract(
            user=user, target_tenant_id=tenant_id
        )

    def test_assert_can_extract_admin_succeeds(self):
        tenant_id = uuid.uuid4()
        user = _make_user(tenant_id=tenant_id, role="admin")
        GraphSecurityPolicy().assert_can_extract(
            user=user, target_tenant_id=tenant_id
        )

    def test_assert_can_extract_member_raises_403(self):
        tenant_id = uuid.uuid4()
        user = _make_user(tenant_id=tenant_id, role="member")
        with pytest.raises(ForbiddenException) as exc:
            GraphSecurityPolicy().assert_can_extract(
                user=user, target_tenant_id=tenant_id
            )
        assert exc.value.code == 403
        # The data payload carries the role detail
        # so the API layer can render a useful 403.
        assert exc.value.data is not None
        assert exc.value.data.get("field") == "role"

    def test_assert_can_extract_viewer_raises_403(self):
        tenant_id = uuid.uuid4()
        user = _make_user(tenant_id=tenant_id, role="viewer")
        with pytest.raises(ForbiddenException):
            GraphSecurityPolicy().assert_can_extract(
                user=user, target_tenant_id=tenant_id
            )

    def test_assert_can_extract_cross_tenant_raises_403(self):
        user = _make_user(tenant_id=uuid.uuid4(), role="owner")
        with pytest.raises(ForbiddenException):
            GraphSecurityPolicy().assert_can_extract(
                user=user, target_tenant_id=uuid.uuid4()
            )

    def test_require_extraction_role_helper(self):
        """The :func:`require_extraction_role` free function delegates to the policy."""
        tenant_id = uuid.uuid4()
        owner = _make_user(tenant_id=tenant_id, role="owner")
        # No exception for owner
        require_extraction_role(owner, target_tenant_id=tenant_id)

        member = _make_user(tenant_id=tenant_id, role="member")
        with pytest.raises(ForbiddenException):
            require_extraction_role(member, target_tenant_id=tenant_id)

    def test_extraction_roles_constant(self):
        assert EXTRACTION_ROLES == frozenset({"owner", "admin"})
