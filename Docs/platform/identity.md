# Identity Module

V9 Part 4, Task 47.

## Purpose

Multi-tenant identity, authentication, and authorisation.
Owns the `tenants`, `users`, and `sessions` tables and the
JWT + refresh-token lifecycle.

## Architecture

```
identity/
├── domain/
│   ├── entities.py        # Tenant, User, Session
│   ├── value_objects.py   # Email, Role, APIKey
│   └── exceptions.py      # AuthError, TenantNotFoundError
├── application/
│   ├── command/           # RegisterTenant, InviteUser, etc.
│   └── query/             # GetTenant, GetUserByEmail, etc.
├── infrastructure/
│   ├── models.py          # SQLAlchemy tables
│   ├── repositories.py    # TenantRepository, UserRepository
│   └── security.py        # password hashing, JWT
└── interface/
    ├── rest/              # /auth/* routes
    └── dependencies.py    # get_current_user, require_role
```

## Public interfaces

* `POST /api/v1/auth/login` — email + password → access + refresh
* `POST /api/v1/auth/refresh` — refresh token → new access token
* `POST /api/v1/auth/logout` — invalidate session
* `GET /api/v1/tenants/me` — current tenant info
* `POST /api/v1/users` — admin-only
* `GET /api/v1/users/{id}` — owner or admin

## Configuration

| Key | Default | Description |
| --- | --- | --- |
| `SECRET_KEY` | (required) | JWT signing key |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 30 | Access token TTL |
| `REFRESH_TOKEN_EXPIRE_DAYS` | 7 | Refresh token TTL |
| `PASSWORD_BCRYPT_ROUNDS` | 12 | Password hashing cost |
| `API_KEY_BCRYPT_ROUNDS` | 10 | API key hashing cost |

## Dependencies

* `passlib`, `bcrypt` — password hashing
* `python-jose` — JWT
* `cryptography` — key management

## Extension points

* Custom auth provider: subclass
  `identity.infrastructure.security.AuthProvider` and
  wire it in `core/dependencies.py`.
* Custom RBAC roles: extend `Role` enum and update
  `require_role` checks.
