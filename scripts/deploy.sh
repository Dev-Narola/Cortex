#!/usr/bin/env bash
# =============================================================================
# Cortex — one-command production deploy
# =============================================================================
#
# What this script does
# ---------------------
# 1. Pulls the requested image from the registry.
# 2. Renders the production ``.env`` from AWS Secrets Manager
#    so the host's docker-compose has a single source of truth
#    for secrets (and so they never live in git).
# 3. Performs a rolling restart of the api/worker containers
#    using ``docker compose up -d --no-deps``. The
#    ``--no-deps`` flag stops dependents from being recreated
#    in dependency order — we want the api/worker to come up
#    *first* (with the new code) while the database / redis
#    containers stay put.
# 4. Waits for the new api container to pass its healthcheck.
# 5. Rolls back to the previously known-good image tag if the
#    healthcheck fails.
#
# Usage
# -----
#   ./scripts/deploy.sh                          # deploys :latest
#   ./scripts/deploy.sh --image-tag <sha>        # deploys a specific build
#   ./scripts/deploy.sh --skip-migrations        # do not run alembic
#   ./scripts/deploy.sh --no-rollback            # leave a broken deploy in
#                                                # place (for debugging)
#
# The script is safe to run by hand; the CD pipeline (cd.yml)
# invokes it via SSH on the EC2 host with ``--image-tag
# ${{ github.sha }}``.
#
# Required environment (set by the CD workflow or the operator):
#   CORTEX_IMAGE         (e.g. ghcr.io/cortex/cortex)
#   CORTEX_IMAGE_TAG     (default: latest)
#   AWS_REGION           (default: us-east-1)
#   COMPOSE_FILE         (default: Docker/docker-compose.prod.yml)
#   PROJECT_DIR          (default: /opt/cortex)
# =============================================================================

set -Eeuo pipefail

# ---- pretty logging --------------------------------------------------------
log() {
    printf '[%s] %-7s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1" "${*:2}"
}

on_error() {
    local rc=$?
    local line=${BASH_LINENO[0]:-?}
    log "ERROR" "deploy.sh failed at line ${line} (exit ${rc})"
    exit "${rc}"
}
trap on_error ERR

# ---- defaults --------------------------------------------------------------
: "${PROJECT_DIR:=/opt/cortex}"
: "${COMPOSE_FILE:=Docker/docker-compose.prod.yml}"
: "${CORTEX_IMAGE:=ghcr.io/cortex/cortex}"
: "${CORTEX_IMAGE_TAG:=latest}"
: "${AWS_REGION:=us-east-1}"
: "${HEALTH_TIMEOUT_SECONDS:=120}"
: "${HEALTH_POLL_INTERVAL:=5}"

SKIP_MIGRATIONS=false
NO_ROLLBACK=false

# ---- argument parsing ------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --image-tag)
            CORTEX_IMAGE_TAG="$2"
            shift 2
            ;;
        --image)
            CORTEX_IMAGE="$2"
            shift 2
            ;;
        --compose-file)
            COMPOSE_FILE="$2"
            shift 2
            ;;
        --project-dir)
            PROJECT_DIR="$2"
            shift 2
            ;;
        --skip-migrations)
            SKIP_MIGRATIONS=true
            shift
            ;;
        --no-rollback)
            NO_ROLLBACK=true
            shift
            ;;
        --health-timeout)
            HEALTH_TIMEOUT_SECONDS="$2"
            shift 2
            ;;
        -h|--help)
            grep '^#' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        *)
            log "ERROR" "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# ---- preflight -------------------------------------------------------------
cd "${PROJECT_DIR}"
log "INFO" "Deploying cortex"
log "INFO" "  image=${CORTEX_IMAGE}:${CORTEX_IMAGE_TAG}"
log "INFO" "  compose=${COMPOSE_FILE}"
log "INFO" "  project_dir=${PROJECT_DIR}"
log "INFO" "  skip_migrations=${SKIP_MIGRATIONS}  no_rollback=${NO_ROLLBACK}"

# Pull secrets from Secrets Manager so the *host* has a
# rendered ``.env`` that docker-compose can read. The api and
# worker containers re-fetch them at start time too, but the
# postgres container needs them before it boots, so they have
# to be on the host.
RENDER_PATH="${PROJECT_DIR}/.env.runtime"
log "INFO" "Rendering host env from Secrets Manager → ${RENDER_PATH}"
: > "${RENDER_PATH}"
chmod 0600 "${RENDER_PATH}"

for secret in "POSTGRES_USER" "POSTGRES_PASSWORD" "POSTGRES_DB" "AWS_REGION"; do
    value="$(aws secretsmanager get-secret-value \
                --secret-id "${secret}" \
                --query SecretString --output text 2>/dev/null || true)"
    if [[ -n "${value}" && "${value}" != "None" ]]; then
        printf '%s=%q\n' "${secret}" "${value}" >> "${RENDER_PATH}"
    fi
done

# `docker compose` reads the env_file via the ``env_file:``
# declaration. We expose RENDER_PATH as the file to read.
export ENV_FILE="${RENDER_PATH}"

# ---- determine the previous image tag (for rollback) ----------------------
# ``docker compose ps`` does not surface the image tag, so we
# record the current tag in a sentinel file on every successful
# deploy. The previous tag is read on the next run; if the
# sentinel is missing, rollback is a no-op.
PREVIOUS_TAG_FILE="${PROJECT_DIR}/.last-good-tag"
PREVIOUS_TAG=""
if [[ -f "${PREVIOUS_TAG_FILE}" ]]; then
    PREVIOUS_TAG="$(cat "${PREVIOUS_TAG_FILE}")"
fi
log "INFO" "Previous known-good tag: ${PREVIOUS_TAG:-<none>}"

# ---- 1. pull the image -----------------------------------------------------
log "INFO" "Pulling ${CORTEX_IMAGE}:${CORTEX_IMAGE_TAG}"
docker pull "${CORTEX_IMAGE}:${CORTEX_IMAGE_TAG}"

# ---- 2. rolling restart ----------------------------------------------------
# ``docker compose up -d`` re-creates only the services whose
# image / config changed. With ``--no-deps`` we do not cascade
# the recreation to the database / redis containers, which is
# the right behaviour for a code deploy.
log "INFO" "Restarting api + worker (rolling)"
CORTEX_IMAGE="${CORTEX_IMAGE}" \
CORTEX_IMAGE_TAG="${CORTEX_IMAGE_TAG}" \
    docker compose -f "${COMPOSE_FILE}" \
                   --env-file "${RENDER_PATH}" \
                   up -d --no-deps api worker

# ---- 3. health check -------------------------------------------------------
log "INFO" "Waiting for api to become healthy (timeout ${HEALTH_TIMEOUT_SECONDS}s)"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SECONDS ))
healthy=false
while [[ $(date +%s) -lt ${deadline} ]]; do
    # ``docker compose ps --format json`` gives machine-parseable
    # state. We grep for "healthy" in the api container's
    # Health string. If docker compose has not yet computed a
    # state, the field is empty — we wait and try again.
    if docker compose -f "${COMPOSE_FILE}" ps api --format json \
        | grep -q '"Health":"healthy"'; then
        healthy=true
        break
    fi
    sleep "${HEALTH_POLL_INTERVAL}"
done

# ---- 4. result -------------------------------------------------------------
if [[ "${healthy}" == "true" ]]; then
    log "INFO" "Deploy OK — ${CORTEX_IMAGE}:${CORTEX_IMAGE_TAG} is healthy"
    # Persist the known-good tag *after* we have confirmed
    # health, so a half-deployed tag is never recorded.
    echo "${CORTEX_IMAGE_TAG}" > "${PREVIOUS_TAG_FILE}"
    exit 0
fi

# Health check failed. Bail loudly.
log "ERROR" "Deploy FAILED — api never became healthy within ${HEALTH_TIMEOUT_SECONDS}s"

if [[ "${NO_ROLLBACK}" == "true" ]]; then
    log "ERROR" "--no-rollback set; leaving the broken image in place for debugging"
    exit 1
fi

if [[ -z "${PREVIOUS_TAG}" || "${PREVIOUS_TAG}" == "${CORTEX_IMAGE_TAG}" ]]; then
    log "ERROR" "No previous good tag to roll back to (or it equals the current tag)"
    exit 1
fi

log "WARN" "Rolling back to ${CORTEX_IMAGE}:${PREVIOUS_TAG}"
CORTEX_IMAGE="${CORTEX_IMAGE}" \
CORTEX_IMAGE_TAG="${PREVIOUS_TAG}" \
    docker compose -f "${COMPOSE_FILE}" \
                   --env-file "${RENDER_PATH}" \
                   up -d --no-deps api worker

# Give the rollback a brief window to come back. We do not
# block on a full health check here — the operator will see
# the result of ``docker compose ps`` in the logs anyway, and a
# failed rollback is a much rarer event than a failed deploy.
sleep 30
if docker compose -f "${COMPOSE_FILE}" ps api --format json \
    | grep -q '"Health":"healthy"'; then
    log "WARN" "Rollback to ${PREVIOUS_TAG} succeeded"
    exit 1   # the original deploy still failed
fi

log "ERROR" "Rollback to ${PREVIOUS_TAG} also failed — manual intervention required"
exit 2
