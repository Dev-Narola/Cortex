#!/usr/bin/env bash
# =============================================================================
# Cortex - PostgreSQL backup (run on the production host; cron nightly and
# before every deploy).
#
#   1. pg_dump -Fc inside the postgres container -> /opt/cortex/backups
#   2. keep the newest $KEEP_LOCAL dumps on the host
#   3. copy the dump off the host to s3://$S3_BUCKET/backups/postgres/ using
#      the api container's boto3 + S3 credentials (the host has no AWS CLI)
#
# Exit codes: 0 ok, 1 dump failed, 2 dump ok but the off-host copy failed
# (the local dump still exists - fix the bucket policy, don't ignore it).
#
# Restore:
#   docker exec -i cortex-postgres sh -c \
#     'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
#     < /opt/cortex/backups/<file>.dump
# =============================================================================
set -Eeuo pipefail

: "${BACKUP_DIR:=/opt/cortex/backups}"
: "${KEEP_LOCAL:=7}"
: "${PG_CONTAINER:=cortex-postgres}"
: "${API_CONTAINER:=cortex-api}"

log() { printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
name="cortex-$(date -u +%Y%m%dT%H%M%SZ).dump"
path="$BACKUP_DIR/$name"

log "pg_dump -> $path"
if ! docker exec "$PG_CONTAINER" sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-privileges' > "$path"; then
    rm -f "$path"
    log "ERROR pg_dump failed"
    exit 1
fi
chmod 600 "$path"
# A valid custom-format dump lists its TOC; an empty/garbled file does not.
docker exec -i "$PG_CONTAINER" pg_restore --list > /dev/null < "$path"
log "dump ok: $(stat -c %s "$path") bytes"

ls -1t "$BACKUP_DIR"/cortex-*.dump | tail -n +"$((KEEP_LOCAL + 1))" | xargs -r rm -f

log "off-host copy -> s3://\$S3_BUCKET/backups/postgres/$name"
if docker exec -i -e BACKUP_NAME="$name" "$API_CONTAINER" python -c '
import os, sys, boto3
s3 = boto3.client(
    "s3",
    region_name=os.environ.get("S3_REGION"),
    endpoint_url=os.environ.get("S3_ENDPOINT") or None,
    aws_access_key_id=os.environ.get("S3_ACCESS_KEY") or None,
    aws_secret_access_key=os.environ.get("S3_SECRET_KEY") or None,
)
s3.upload_fileobj(sys.stdin.buffer, os.environ["S3_BUCKET"],
                  "backups/postgres/" + os.environ["BACKUP_NAME"],
                  ExtraArgs={"ServerSideEncryption": "AES256"})
' < "$path"; then
    log "off-host copy ok"
else
    log "ERROR off-host copy failed; local dump kept at $path"
    exit 2
fi
