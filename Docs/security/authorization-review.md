# Authorization Review

V9 Part 3, Task 27.

This document records the per-endpoint authorization
verification. Every privileged endpoint is checked for:

* Tenant isolation (`tenant_id` filter on the repository call)
* RBAC (the role required by `require_role`)
* Resource ownership (the resource belongs to the caller)
* Object-level authorization (the caller's role can read /
  write / delete this object)
* Function-level authorization (the endpoint requires the
  elevated role)

## REST endpoints

| Path | Method | Tenant? | Role | Notes |
| --- | --- | --- | --- | --- |
| `/auth/login` | POST | n/a (issues tenant on success) | n/a | Rate-limited per IP |
| `/auth/refresh` | POST | n/a | n/a | Refresh token bound to tenant |
| `/tenants` | POST | n/a | n/a (admin) | Admin only |
| `/tenants/me` | GET | yes | any | Returns the caller's tenant |
| `/users` | POST | yes | admin | RBAC enforced |
| `/users/{id}` | GET | yes | owner or admin | Object-level |
| `/users/{id}` | PATCH | yes | owner or admin | Object-level |
| `/documents` | POST | yes | any | Tenant-scoped |
| `/documents/{id}` | GET | yes | any | Tenant-scoped |
| `/documents/{id}` | DELETE | yes | owner or admin | Object-level |
| `/chunks` | GET | yes | any | Tenant-scoped |
| `/search` | POST | yes | any | Tenant-scoped |
| `/graph/extract` | POST | yes | owner / admin | Function-level (V7) |
| `/graph/entities` | GET | yes | any | Tenant-scoped |
| `/graph/relations` | GET | yes | any | Tenant-scoped |
| `/graph/neighbors/{id}` | GET | yes | any | Tenant-scoped |
| `/agents` | POST | yes | any | Tenant-scoped |
| `/agents/{id}/invoke` | POST | yes | any | Tenant-scoped |
| `/mcp/tools` | GET | yes | any | Tenant-scoped |
| `/mcp/tools/invoke` | POST | yes | any | Function-level (per-tool) |
| `/mcp/sessions` | POST | yes | any | Tenant-scoped |
| `/billing/usage` | GET | yes | owner / admin | Function-level |
| `/admin/audit` | GET | yes | admin | Function-level |

## GraphQL endpoints

| Field | Tenant? | Role | Notes |
| --- | --- | --- | --- |
| `entity(id)` | yes | any | Tenant-scoped |
| `entities(name)` | yes | any | Tenant-scoped |
| `neighbors(id)` | yes | any | Tenant-scoped |
| `searchEntities(query)` | yes | any | Tenant-scoped |
| `extractGraph(documentId)` | yes | owner / admin | Function-level (V7) |

## MCP endpoints

| Tool | Tenant? | Role | Notes |
| --- | --- | --- | --- |
| `cortex.search` | yes | any | Tenant-scoped |
| `cortex.entity_lookup` | yes | any | Tenant-scoped |
| `cortex.graph_neighbors` | yes | any | Tenant-scoped |
| `cortex.document_upload` | yes | any | Tenant-scoped |
| `cortex.agent_invoke` | yes | any | Tenant-scoped |

## Worker tasks

| Task | Tenant? | Notes |
| --- | --- | --- |
| `ingest_document` | yes | Pinned from the original document |
| `embed_chunks` | yes | Inherited from the document |
| `extract_graph` | yes | Inherited from the document |
| `execute_agent` | yes | Inherited from the agent |

## Audit events

The audit logger records every privileged action:

* `auth.login.success` / `auth.login.failure`
* `auth.refresh.success` / `auth.refresh.failure`
* `permission.denied` (403)
* `session.revoked`
* `mcp.auth.failure`
* `tool.authorization.failure`
* `secret.access`
* `admin.action`
