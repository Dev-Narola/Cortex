#!/usr/bin/env bash
# =============================================================================
# Cortex — postgres backup script
# =============================================================================
# Runs from the EC2 host's crontab. Produces a consistent
# ``pg_dump`` of the running database and writes it to a
# private S3 bucket that is *separate* from the document
# bucket (so a misapplied lifecycle policy on one cannot
# affect the other).
#
# Why a custom dump format (``-Fc``)?
# ----------------------------------
# The custom format is smaller than SQL text (already
# compressed with internal zlib), supports parallel restore
# via ``pg_restore -j``, and the dump is treated as opaque
# bytes by S3 — so an attacker who exfiltrates the dump
# cannot grep it directly without ``pg_restore``.
#
# Why gzip on top of the custom format?
# -------------------------------------
# A marginal extra compression win, but a noticeable cost
# win on the S3 PUT. Custom-format output is already
# compressed; the gzip layer typically adds another ~20%
# on top.
#
# Why a daily + weekly cadence (called separately)?
# ------------------------------------------------
# The script's behaviour is driven by ``$BACKUP_PREFIX``.
# The cron entries set the prefix; the bucket's lifecycle
# policy does the retention. This is one script, two
# cadences, no duplication.
# =============================================================================

set -Eeuo pipefail

# ---- defaults (override via the environment in the crontab) ---------------
: "${PG_CONTAINER:=cortex-postgres}"
: "${PG_USER:=cortex}"
: "${PG_DB:=cortex}"
: "${BACKUP_BUCKET:=cortex-backups-prod}"
: "${BACKUP_PREFIX:=postgres}"
: "${RETENTION_DAYS:=30}"
: "${AWS_REGION:=us-east-1}"

# ---- pretty logging --------------------------------------------------------
log() {
    printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

on_error() {
    local rc=$?
    local line=${BASH_LINENO[0]:-?}
    log "ERROR backup failed at line ${line} (exit ${rc})"
    exit "${rc}"
}
trap on_error ERR

# ---- preflight -------------------------------------------------------------
if ! command -v aws >/dev/null 2>&1; then
    log "ERROR awscli not found in PATH; install via 'sudo yum install -y awscli' or use v2"
    exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
    log "ERROR docker not found in PATH"
    exit 1
fi
if ! docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER}\$"; then
    log "ERROR postgres container '${PG_CONTAINER}' is not running"
    exit 1
fi

# ---- 1. pg_dump ------------------------------------------------------------
TS=$(date -u +%Y%m%dT%H%M%SZ)
DUMP_PATH="/tmp/cortex-${TS}.dump"
log "starting pg_dump -> ${DUMP_PATH}"

# ``--no-owner --no-privileges`` keeps the dump portable
# across role names. The restore target may use a
# different role for ownership; granting the right
# ownership is the operator's job at restore time, not
# the dump's.
docker exec "${PG_CONTAINER}" \
    pg_dump -U "${PG_USER}" -d "${PG_DB}" -Fc \
            --no-owner --no-privileges \
    > "${DUMP_PATH}"

# Capture the uncompressed size for the log line. The
# compressed output is the value that actually goes to
# S3; the operator monitoring this script wants the raw
# dump size to know what to expect.
RAW_SIZE=$(stat -c %s "${DUMP_PATH}")
log "pg_dump complete: ${RAW_SIZE} bytes uncompressed"

# ---- 2. compress -----------------------------------------------------------
# ``gzip -6`` is a reasonable CPU/ratio compromise. Higher
# levels are diminishing returns; lower levels save no
# time we care about.
gzip -6 "${DUMP_PATH}"
GZ_PATH="${DUMP_PATH}.gz"
GZ_SIZE=$(stat -c %s "${GZ_PATH}")
log "gzip complete: ${GZ_SIZE} bytes (${RAW_SIZE} -> ${GZ_SIZE})"

# ---- 3. upload -------------------------------------------------------------
S3_KEY="s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/${TS}.dump.gz"
log "uploading -> ${S3_KEY}"

aws s3 cp "${GZ_PATH}" "${S3_KEY}" \
    --region "${AWS_REGION}" \
    --only-show-errors \
    --storage-class STANDARD_IA

log "upload complete"

# ---- 4. local cleanup ------------------------------------------------------
rm -f "${GZ_PATH}"

# ---- 5. emit a structured success line -------------------------------------
# ``/var/log/cortex-backup.log`` is the file the cron
# command appends to. The line below is the canonical
# "backup succeeded" marker — easy to grep for in
# monitoring.
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] backup ok: ${S3_KEY} (${GZ_SIZE} bytes)"
