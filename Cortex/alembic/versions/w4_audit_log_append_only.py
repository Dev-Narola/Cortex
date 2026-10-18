"""audit_log is append-only at the database level (FR-AUDIT-01, audit H13).

A trigger rejects UPDATE, DELETE and TRUNCATE, so neither application code
nor an FK cascade can rewrite history. Consequence (intended): a tenant or
user that has audit rows cannot be hard-deleted; deactivate instead. The
application never deletes either.

Also re-creates ck_audit_log_action with ``conversation_renamed``: the
enum had it, the CHECK didn't, so every rename audit write was rejected.

Revision ID: w4_audit_log_append_only
Revises: w3_api_key_lookup
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "w4_audit_log_append_only"
down_revision: str | Sequence[str] | None = "w3_api_key_lookup"
branch_labels = None
depends_on = None


_ACTIONS = (
    "document_created", "document_accessed", "document_deleted",
    "document_ingestion_started", "document_ingestion_completed", "document_ingestion_failed",
    "api_key_created", "api_key_revoked", "tenant_created", "tenant_updated",
    "user_invited", "user_updated", "user_removed", "role_changed",
    "conversation_created", "conversation_accessed", "conversation_deleted",
    "conversation_renamed", "login_success", "login_failure", "logout",
)


def _action_check(actions) -> None:
    op.drop_constraint("ck_audit_log_action", "audit_log", type_="check")
    op.create_check_constraint(
        "ck_audit_log_action", "audit_log", f"action IN ({', '.join(repr(a) for a in actions)})"
    )


def upgrade() -> None:
    _action_check(_ACTIONS)
    op.execute(
        """
        CREATE OR REPLACE FUNCTION audit_log_reject_change() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'audit_log is append-only (% rejected)', TG_OP
                USING ERRCODE = 'insufficient_privilege';
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        "CREATE TRIGGER audit_log_no_update_delete BEFORE UPDATE OR DELETE ON audit_log "
        "FOR EACH ROW EXECUTE FUNCTION audit_log_reject_change()"
    )
    op.execute(
        "CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log "
        "FOR EACH STATEMENT EXECUTE FUNCTION audit_log_reject_change()"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log")
    op.execute("DROP TRIGGER IF EXISTS audit_log_no_update_delete ON audit_log")
    op.execute("DROP FUNCTION IF EXISTS audit_log_reject_change()")
    _action_check(tuple(a for a in _ACTIONS if a != "conversation_renamed"))
