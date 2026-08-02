#!/usr/bin/env bash
# =============================================================================
# Cortex — production container entrypoint
# =============================================================================
#
# Responsibilities (in order):
#   1. Resolve all required configuration. Anything that comes from
#      AWS Secrets Manager is fetched now, written to a tmpfs at
#      ``$SECRETS_RENDER_PATH`` (default /run/secrets/.env), and
#      exported into the current process so the rest of the
#      startup — and the application it execs — inherits the
#      values.
#   2. Run database migrations (``alembic upgrade head``) on
#      every boot. This is the right default for a small,
#      single-host deployment: a fresh deploy self-bootstraps,
#      and an in-place upgrade is one less thing for the operator
#      to remember. Set ``RUN_DB_MIGRATIONS_ON_START=false`` to
#      skip this step.
#   3. Dispatch to the role passed via ``CORTEX_ROLE`` (api or
#      worker). The CMD from the docker-compose service wins
#      when both are set; this script honours ``$1`` so the
#      CMD-as-default pattern in the Dockerfile still works.
#
# The script is intentionally verbose: every step that the
# operator would otherwise do by hand is logged in a single
# stream. When the container fails to start, the log should be
# enough to identify which step broke without attaching a shell.
# =============================================================================

set -Eeuo pipefail

# ---- pretty logging --------------------------------------------------------
# All output goes to stdout in a single format so journald /
# CloudWatch Logs ingest it cleanly. ``log()`` is the only
# supported way to print; the raw ``echo`` calls below are
# reserved for the early bootstrap section before the log
# function is defined.
log() {
    local level="$1"
    shift
    printf '[%s] %-7s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$level" "$*"
}

# ---- error trap ------------------------------------------------------------
# Any non-zero exit from this point on is logged with the line
# number that caused it, then the script bails. The container's
# restart policy (unless-stopped) will then decide whether to
# bring the service back up.
on_error() {
    local rc=$?
    local line=${BASH_LINENO[0]:-?}
    log "ERROR" "start.sh failed at line ${line} (exit ${rc})"
    exit "${rc}"
}
trap on_error ERR

# ---- configuration ---------------------------------------------------------
: "${ENVIRONMENT:=production}"
: "${SECRETS_MANAGER_ENABLED:=false}"
: "${SECRETS_RENDER_PATH:=/run/secrets/.env}"
: "${AWS_REGION:=us-east-1}"
: "${RUN_DB_MIGRATIONS_ON_START:=true}"

export AWS_REGION
export AWS_DEFAULT_REGION="${AWS_REGION}"

# CORTEX_ROLE is the role the container is playing. The CMD
# from docker-compose is the source of truth; the env var is
# here for symmetry with ``docker run``.
ROLE="${1:-${CORTEX_ROLE:-api}}"

log "INFO" "Cortex container starting"
log "INFO" "  role=${ROLE}  environment=${ENVIRONMENT}  aws_region=${AWS_REGION}"
log "INFO" "  secrets_manager=${SECRETS_MANAGER_ENABLED}  render_path=${SECRETS_RENDER_PATH}"

# ---- 1. secrets -----------------------------------------------------------
# The list of env var names that must be present before the
# application starts. A failure to resolve any of these aborts
# the boot — the application cannot run safely without them.
REQUIRED_SECRETS=(
    "SECRET_KEY"
    "DATABASE_URL"
    "REDIS_URL"
    "POSTGRES_PASSWORD"
    "OPENAI_API_KEY"
    "S3_BUCKET"
)

if [[ "${SECRETS_MANAGER_ENABLED}" == "true" ]]; then
    log "INFO" "Fetching secrets from AWS Secrets Manager"

    # The tmpfs mount at SECRETS_RENDER_PATH is private to this
    # container. We render the resolved env to a flat
    # ``KEY=VALUE`` file (one per line) and ``export`` every
    # line into the current shell before exec'ing the app.
    mkdir -p "$(dirname "${SECRETS_RENDER_PATH}")"
    : > "${SECRETS_RENDER_PATH}"
    chmod 0600 "${SECRETS_RENDER_PATH}"

    for secret in "${REQUIRED_SECRETS[@]}"; do
        # ``--query SecretString --output text`` returns the
        # raw string. If the secret is stored as a JSON blob,
        # ``get_json_secret`` in the app unpacks it; the entry
        # point only handles the simple ``SecretString`` form.
        value="$(aws secretsmanager get-secret-value \
                    --secret-id "${secret}" \
                    --query SecretString \
                    --output text 2>/dev/null || true)"

        if [[ -z "${value}" || "${value}" == "None" ]]; then
            log "ERROR" "Required secret '${secret}' is missing in Secrets Manager"
            exit 1
        fi

        # Sanity: env files cannot contain literal newlines or
        # unescaped quotes. AWS Secrets Manager will not return
        # those for a SecretString, but we strip just in case
        # the value was authored with a trailing newline.
        value="${value%$'\n'}"

        printf '%s=%q\n' "${secret}" "${value}" >> "${SECRETS_RENDER_PATH}"
        export "${secret}=${value}"
        log "INFO" "  loaded ${secret} (length=${#value})"
    done

    # Optional secrets — set if present, missing is fine.
    for secret in "S3_ACCESS_KEY" "S3_SECRET_KEY" "S3_ENDPOINT"; do
        value="$(aws secretsmanager get-secret-value \
                    --secret-id "${secret}" \
                    --query SecretString \
                    --output text 2>/dev/null || true)"
        if [[ -n "${value}" && "${value}" != "None" ]]; then
            value="${value%$'\n'}"
            printf '%s=%q\n' "${secret}" "${value}" >> "${SECRETS_RENDER_PATH}"
            export "${secret}=${value}"
            log "INFO" "  loaded ${secret}"
        fi
    done

    log "INFO" "Secrets rendered to ${SECRETS_RENDER_PATH}"
else
    log "INFO" "Secrets Manager disabled — relying on environment variables"
    for secret in "${REQUIRED_SECRETS[@]}"; do
        if [[ -z "${!secret:-}" ]]; then
            log "ERROR" "Required env var '${secret}' is not set"
            exit 1
        fi
    done
fi

# ---- 2. database migrations ----------------------------------------------
# Run migrations before starting either the api or the worker.
# The worker is not strictly required to run migrations — its
# queries go through the same SQLAlchemy engine and therefore
# honour the schema as it exists when the query is issued — but
# running migrations on the worker is a free correctness check
# (a bad migration will block the worker from starting instead
# of failing in a partial state later).
if [[ "${RUN_DB_MIGRATIONS_ON_START}" == "true" ]]; then
    log "INFO" "Running alembic migrations"
    if ! alembic upgrade heads; then
        log "ERROR" "alembic upgrade heads failed"
        exit 1
    fi
    log "INFO" "Migrations applied"
else
    log "INFO" "Skipping migrations (RUN_DB_MIGRATIONS_ON_START=false)"
fi

# ---- 3. dispatch ----------------------------------------------------------
# The final ``exec`` is what the docker-compose restart policy
# sees. Putting it last means the api/worker gets PID 1 and
# receives the SIGTERM that ``docker stop`` sends, so graceful
# shutdown is the application code's problem, not ours.
case "${ROLE}" in
    api)
        log "INFO" "Starting API (uvicorn, workers=${API_WORKERS:-1})"
        exec uvicorn src.main:app \
            --host 0.0.0.0 \
            --port 8000 \
            --workers "${API_WORKERS:-1}" \
            --timeout-keep-alive 60 \
            --access-log \
            --no-server-header
        ;;
    worker)
        log "INFO" "Starting worker (arq)"
        exec python -m arq src.ingestion.workers.worker.WorkerSettings
        ;;
    *)
        log "ERROR" "Unknown CORTEX_ROLE: '${ROLE}' (expected 'api' or 'worker')"
        exit 1
        ;;
esac
