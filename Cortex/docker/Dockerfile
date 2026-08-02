# =============================================================================
# Cortex — production image (V5)
# =============================================================================
#
# A single image with two entrypoints:
#   - API service:  ``uvicorn src.main:app --host 0.0.0.0 --port 8000 --workers N``
#   - Worker:       ``python -m arq src.ingestion.workers.worker.WorkerSettings``
#
# The same image is reused for both roles in docker-compose.prod.yml;
# the entrypoint script (``scripts/start.sh``) dispatches based on the
# ``CORTEX_ROLE`` environment variable. This avoids the "two divergent
# Dockerfiles drift apart" failure mode.
#
# Build stages
# ------------
#   builder  : installs the full dependency set (including build tools
#              needed to compile ``psycopg`` and ``bcrypt`` wheels) and
#              then exports a clean site-packages into ``/install``.
#   runtime  : copies only the installed packages and the application
#              code, runs as a non-root user, exposes the health
#              endpoint, and defaults to the API entrypoint.
#
# Image size notes
# ----------------
# The base image is ``python:3.12-slim`` (Debian bookworm slim) which
# is the smallest official image that still provides the system
# libraries ``psycopg`` and ``bcrypt`` need at runtime. Alpine is
# intentionally avoided: its musl libc produces subtly different
# wheel behaviour for ``cryptography`` / ``bcrypt`` and routinely
# breaks wheels compiled for manylinux.
#
# Layer-cache notes
# -----------------
# The dependency layer (``pip install -e .``) is invalidated only
# when ``pyproject.toml`` changes. Source-code changes therefore
# rebuild only the small COPY in the runtime stage, not the
# dependency install.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1 — builder
# -----------------------------------------------------------------------------
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

# Install build-time dependencies only. ``--no-install-recommends``
# keeps the image small. ``libpq-dev`` is required to build the
# ``psycopg`` C extensions; ``gcc`` / ``libffi-dev`` / ``libssl-dev``
# are pulled in for the few wheels that need them.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        libffi-dev \
        libpq-dev \
        libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install the project and all of its runtime + dev dependencies
# into a clean prefix we will copy into the runtime stage. Using
# ``--prefix=/install`` keeps the wheels in a single, easy-to-copy
# tree.
COPY pyproject.toml README.md ./
RUN pip install --prefix=/install .

# -----------------------------------------------------------------------------
# Stage 2 — runtime
# -----------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    # Default to UTC; the docker-compose service also pins this for
    # the worker / api containers.
    TZ=UTC

# Runtime system packages only. ``libpq5`` is the runtime
# counterpart of ``libpq-dev`` (the postgres client library that
# ``psycopg`` links against at runtime). ``tini`` is a minimal
# init that reaps zombie processes and forwards signals to the
# application — without it, ``docker stop`` does not gracefully
# shut down the API.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libpq5 \
        tini \
        curl \
        # ``awscli`` is the simplest way to fetch secrets from
        # AWS Secrets Manager in ``start.sh``. Alternatives
        # (custom boto3 one-liner) work but are less testable
        # and require boto3 to be importable at entrypoint time.
        awscli \
        # ``ca-certificates`` so the AWS CLI / boto3 can verify
        # TLS to Secrets Manager.
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create the non-root user that every container role runs as.
# UID 10001 is well above the ``systemd`` reserved range so it
# will not collide with the host's user database if a volume is
# bind-mounted. ``/home/cortex`` is the working directory and
# the destination of the secret-render tmpfs mount.
RUN groupadd --system --gid 10001 cortex \
    && useradd  --system --uid 10001 --gid cortex \
                --home-dir /home/cortex --shell /usr/sbin/nologin \
                --no-create-home cortex \
    && mkdir -p /home/cortex /app /run/secrets \
    && chown -R cortex:cortex /home/cortex /app /run/secrets

# Copy the installed Python packages and the project source from
# the builder. ``/install`` is the prefix from the builder stage;
# we copy it onto the system path in the runtime stage.
COPY --from=builder /install /usr/local
WORKDIR /app
COPY --chown=cortex:cortex src /app/src
COPY --chown=cortex:cortex scripts /app/scripts
COPY --chown=cortex:cortex alembic.ini /app/alembic.ini
COPY --chown=cortex:cortex alembic /app/alembic
# The pyproject + README stay in the image so ``pip check`` and
# any ``importlib.metadata`` lookups continue to work.
COPY --chown=cortex:cortex pyproject.toml README.md /app/

# Make the entrypoint + deploy scripts executable. Both files
# have a shebang and a final newline; chmod is the only setup
# they need.
RUN chmod +x /app/scripts/start.sh /app/scripts/deploy.sh

# Drop privileges. Every subsequent layer runs as the non-root
# ``cortex`` user.
USER cortex

# The application listens on 8000 inside the container. nginx
# in the prod compose proxies to this port; the host's public
# surface is 80/443 on the nginx container.
EXPOSE 8000

# Healthcheck hits the liveness endpoint that the application
# exposes. ``/health`` is intentionally cheap (no DB / Redis
# call) so a stuck dependency does not cause the container to
# be killed and restarted in a loop. The readiness endpoint at
# ``/health/ready`` is what nginx + ALB should use to gate
# traffic; the Docker healthcheck is a coarser backstop.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl --fail --silent http://localhost:8000/health || exit 1

# ``tini`` reaps zombies and forwards signals so the app
# receives SIGTERM on ``docker stop`` and shuts down gracefully.
# ``scripts/start.sh`` is the real entrypoint — it pulls
# secrets, runs migrations, and finally execs the right command
# for ``CORTEX_ROLE``.
ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/start.sh"]

# Default role is the API. docker-compose.prod.yml sets
# ``CORTEX_ROLE=worker`` for the worker service.
CMD ["api"]
