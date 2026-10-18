"""The usage summary query must compile for PostgreSQL (production).

`func.iif` compiled fine on SQLite but does not exist on Postgres, so
GET /tenants/me/usage/summary returned 500 in production.
"""

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

from sqlalchemy.dialects import postgresql

from src.billing.infrastructure.repositories import UsageEventSqlRepository


def test_summary_query_is_portable_to_postgres():
    session = MagicMock()
    session.execute.return_value.one.return_value = SimpleNamespace(
        requests=3,
        embedding_tokens=10,
        completion_input_tokens=5,
        completion_output_tokens=7,
        rerank_units=2,
        estimated_cost_usd=0.001,
    )

    result = UsageEventSqlRepository(session).summary_for_tenant(uuid.uuid4())

    stmt = session.execute.call_args.args[0]
    sql = str(stmt.compile(dialect=postgresql.dialect())).lower()
    assert "iif(" not in sql
    assert "case when" in sql
    assert result == {
        "requests": 3,
        "embedding_tokens": 10,
        "completion_input_tokens": 5,
        "completion_output_tokens": 7,
        "rerank_units": 2,
        "estimated_cost_usd": 0.001,
    }
