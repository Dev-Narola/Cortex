# 6. Tenant-Scoped Data Access

Date: 2026-07-22

## Status

Accepted

## Context

In a multi-tenant SaaS application, preventing cross-tenant data leakage is the highest security priority. A common cause of data leakage is developers writing database queries that forget to include a `WHERE tenant_id = ?` clause, or generating storage paths that lack tenant context.

## Decision

We enforce strict **Tenant-Scoped Data Access** at the repository and storage layers.

1. **Database:** The `tenant_id` must be explicitly passed to repository methods (e.g., `get_by_id(id, tenant_id)`, `list_for_tenant(tenant_id)`). It acts as a mandatory filter on all `SELECT`, `UPDATE`, and `DELETE` operations.
2. **Object Storage:** All objects in S3 must follow a strict, tenant-isolated key hierarchy:
   `tenants/{tenant_id}/documents/{document_id}/original/{filename}`

## Consequences

- **Positive:** Defense-in-depth against data leakage. Even if application logic fails to properly authorize a user, the repository interface forces the tenant context to be provided, making accidental broad queries difficult.
- **Positive:** The S3 key structure provides a physical isolation boundary. It prevents filename collisions (e.g., two tenants uploading `report.pdf`) and makes tenant-specific data teardown trivial (e.g., deleting a tenant just means recursively deleting the `tenants/{tenant_id}/` prefix).
- **Negative:** Slightly increases the verbosity of repository method signatures.
- **Note:** The database remains the authoritative access-control boundary. The S3 path structure is for physical isolation and collision prevention, not access control.
