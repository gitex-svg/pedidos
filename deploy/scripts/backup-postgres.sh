#!/usr/bin/env bash
# Write a PostgreSQL custom-format backup without reading an env file as shell code.
set -euo pipefail
umask 077

ENV_FILE=${ENV_FILE:-.env.production}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/pedidos-gitex}
BACKUP_PREFIX=${BACKUP_PREFIX:-pedidos-gitex}
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
COMPOSE=(docker compose --env-file "$ENV_FILE")
readonly ENV_FILE BACKUP_DIR BACKUP_PREFIX BACKUP_RETENTION_DAYS COMPOSE

die() {
  printf '%s\n' "backup: $*" >&2
  exit 1
}

[ -r "$ENV_FILE" ] || die "environment file is not readable: $ENV_FILE"
case $BACKUP_RETENTION_DAYS in
  ''|*[!0-9]*) die "BACKUP_RETENTION_DAYS must be a non-negative integer" ;;
esac
case $BACKUP_PREFIX in
  ''|*[!A-Za-z0-9._-]*) die "BACKUP_PREFIX has unsafe characters" ;;
esac

mkdir -p "$BACKUP_DIR"
[ -d "$BACKUP_DIR" ] && [ -w "$BACKUP_DIR" ] ||
  die "backup directory is not writable: $BACKUP_DIR"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
final="$BACKUP_DIR/$BACKUP_PREFIX-$stamp.dump"
checksum="$final.sha256"
[ ! -e "$final" ] && [ ! -e "$checksum" ] || die "refusing to replace an existing backup"
tmp=$(mktemp "$BACKUP_DIR/.${BACKUP_PREFIX}-${stamp}.XXXXXX")
checksum_tmp=$(mktemp "$BACKUP_DIR/.${BACKUP_PREFIX}-${stamp}.sha256.XXXXXX")
trap 'rm -f "$tmp" "$checksum_tmp"' EXIT HUP INT TERM

"${COMPOSE[@]}" run --rm -T --no-deps postgres sh -ec \
  'export PGPASSWORD="$POSTGRES_PASSWORD"
   exec pg_dump --format=custom --no-owner --no-privileges \
     -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  >"$tmp"
[ -s "$tmp" ] || die "pg_dump produced an empty file"
cat "$tmp" | "${COMPOSE[@]}" run --rm -T --no-deps postgres \
  pg_restore --list >/dev/null ||
  die "backup format validation failed"
mv -f "$tmp" "$final"
sha256sum "$final" >"$checksum_tmp"
mv -f "$checksum_tmp" "$checksum"

# Only files produced by this script's fixed prefix are eligible for retention.
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name "$BACKUP_PREFIX-*.dump" -o -name "$BACKUP_PREFIX-*.dump.sha256" \) \
  -mtime +"$BACKUP_RETENTION_DAYS" -delete
trap - EXIT HUP INT TERM
printf 'Backup created: %s\nChecksum: %s\n' "$final" "$checksum"