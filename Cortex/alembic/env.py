import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool

from alembic import context

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

# V4 dev-experience fix — load ``.env`` from the
# project root so a developer running ``alembic
# upgrade head`` does not have to remember to set
# ``$env:DATABASE_URL`` first. Real environment
# variables (e.g. set by docker compose) take
# precedence over the .env file. ``python-dotenv``
# is already a project dependency (via
# ``pydantic-settings``).
try:
    from dotenv import load_dotenv

    _ENV_FILE = PROJECT_ROOT / ".env"
    if _ENV_FILE.is_file():
        load_dotenv(_ENV_FILE, override=False)
except ImportError:  # pragma: no cover - dotenv always available
    pass

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

from src.core.database import Base  # noqa: E402

target_metadata = Base.metadata


def get_url() -> str:
    """Return the Alembic database URL.

    Resolution order:

    1. ``$DATABASE_URL`` (highest priority — set by
       docker compose, the dev shell, or CI)
    2. ``.env`` file at the project root
    3. ``sqlalchemy.url`` in ``alembic.ini`` (fallback)
    4. Hard-coded ``localhost:5432`` last-resort default
    """
    return (
        os.getenv("DATABASE_URL")
        or config.get_main_option("sqlalchemy.url")
        or "postgresql+psycopg://postgres:postgres@localhost:5432/app"
    )


def run_migrations_offline() -> None:
    """Run migrations in offline mode."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in online mode."""
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
