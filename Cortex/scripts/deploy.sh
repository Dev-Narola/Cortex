#!/usr/bin/env bash
# =============================================================================
# Cortex - deploy a git ref to the single production host.
#
#   deploy.sh <git-ref>        e.g. deploy.sh 1a2b3c4  |  deploy.sh origin/main
#
# Blueprint V5 layout: one EC2 host, docker compose, image built on the host
# from the checked-out commit and tagged with its short SHA, so a rollback is
# just "start the previous tag" (no rebuild).
#
#   1. refuse if the checkout has local edits (they'd be silently lost)
#   2. back up the database (scripts/backup.sh; a failed dump aborts)
#   3. checkout -> build api+worker image :<sha>
#   4. up -d (the api runs alembic upgrade on boot; the worker waits for it)
#   5. reload nginx/redis config, wait for api + worker to report healthy
#   6. success: record the tag in .last-good-tag, prune dangling images
#      failure: start the last good tag again and exit 1
#
# Schema note: a rollback restores code, not schema. Every migration so far
# is additive except w1 (embedding column type); restoring the pre-deploy
# dump is the way back from a bad migration.
# =============================================================================
set -Eeuo pipefail

REF="${1:?usage: deploy.sh <git-ref>}"
: "${PROJECT_DIR:=/opt/cortex}"
: "${HEALTH_TIMEOUT_SECONDS:=240}"

cd "$PROJECT_DIR"
COMPOSE=(docker compose -f Cortex/docker/docker-compose.prod.yml)
log() { printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

wait_healthy() {
    local deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SECONDS )) c state
    while (( $(date +%s) < deadline )); do
        local all=1
        for c in cortex-api cortex-worker; do
            state=$(docker inspect -f '{{.State.Health.Status}}' "$c" 2>/dev/null || echo missing)
            [[ "$state" == healthy ]] || all=0
        done
        (( all )) && return 0
        sleep 5
    done
    return 1
}

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    log "ERROR local changes in $PROJECT_DIR; commit/stash them first:"
    git status --short --untracked-files=no
    exit 1
fi

PREV_TAG="$(cat .last-good-tag 2>/dev/null || echo latest)"
log "backup before deploy"
bash Cortex/scripts/backup.sh || [[ $? -eq 2 ]]  # 2 = dump ok, off-host copy failed

git fetch --quiet origin
git checkout --quiet --detach "$REF"
TAG="$(git rev-parse --short HEAD)"
export CORTEX_IMAGE_TAG="$TAG"
log "deploying $TAG (last good: $PREV_TAG)"

"${COMPOSE[@]}" build api worker
"${COMPOSE[@]}" up -d --remove-orphans
# Bind-mounted config edits are invisible to compose; reload explicitly.
docker exec cortex-nginx nginx -s reload || true

if wait_healthy; then
    echo "$TAG" > .last-good-tag
    docker image prune -f > /dev/null
    log "deploy ok: $TAG healthy"
    exit 0
fi

log "ERROR $TAG not healthy within ${HEALTH_TIMEOUT_SECONDS}s; recent api logs:"
docker logs --tail 40 cortex-api 2>&1 | sed 's/^/    /' || true
log "rolling back to $PREV_TAG"
CORTEX_IMAGE_TAG="$PREV_TAG" "${COMPOSE[@]}" up -d api worker
if wait_healthy; then
    log "rollback to $PREV_TAG healthy; deploy of $TAG FAILED"
else
    log "ERROR rollback to $PREV_TAG is not healthy either - manual intervention needed"
fi
exit 1
