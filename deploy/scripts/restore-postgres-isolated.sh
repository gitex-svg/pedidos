#!/usr/bin/env bash
# Restore only into an existing, empty, non-production database in this Compose PostgreSQL service.
set -euo pipefail
umask 077

ENV_FILE=${ENV_FILE:-.env.production}
COMPOSE=(docker compose --env-file "$ENV_FILE")
readonly ENV_FILE COMPOSE

die() {
  printf '%s\n' "restore: $*" >&2
  exit 1
}

usage() {
  printf '%s\n' "Usage: $0 BACKUP.dump TARGET_DATABASE --confirm RESTORE-TARGET_DATABASE" >&2
  exit 2
}

[ "$#" -eq 4 ] || usage
backup=$1
target_database=$2
[ "$3" = "--confirm" ] || usage
[ "$4" = "RESTORE-$target_database" ] ||
  die "explicit confirmation must be RESTORE-$target_database"
[ -r "$ENV_FILE" ] || die "environment file is not readable: $ENV_FILE"
[ -f "$backup" ] || die "backup is not a regular readable file"
case $target_database in
  [A-Za-z_]*)
    case $target_database in *[!A-Za-z0-9_]* ) die "target database identifier is invalid" ;; esac ;;
  *) die "target database identifier is invalid" ;;
esac
case $target_database in
  postgres|template0|template1) die "target database is reserved and not isolated" ;;
esac

cat "$backup" | "${COMPOSE[@]}" run --rm -T --no-deps postgres \
  pg_restore --list >/dev/null ||
  die "backup format validation failed"
if [ -f "$backup.sha256" ]; then
  (
    cd "$(dirname "$backup")"
    sha256sum -c "$(basename "$backup").sha256"
  ) >/dev/null || die "backup checksum validation failed"
fi

"${COMPOSE[@]}" run --rm -T --no-deps postgres sh -ec \
  'export PGPASSWORD="$POSTGRES_PASSWORD"
   test "$1" != "$POSTGRES_DB" || { echo "target is the production database" >&2; exit 1; }
   psql -v ON_ERROR_STOP=1 -h postgres -U "$POSTGRES_USER" -d postgres -Atqc \
     "SELECT datname FROM pg_database" | grep -Fqx "$1"
   count=$(psql -v ON_ERROR_STOP=1 -h postgres -U "$POSTGRES_USER" -d "$1" -Atqc \
     "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('"'"'pg_catalog'"'"','"'"'information_schema'"'"') AND n.nspname !~ '"'"'^pg_toast'"'"';")
   test "$count" = 0 || { echo "target database is not empty" >&2; exit 1; }' \
  sh "$target_database" || die "target must exist, differ from production, and be empty"

cat "$backup" | "${COMPOSE[@]}" run --rm -T --no-deps postgres sh -ec \
  'export PGPASSWORD="$POSTGRES_PASSWORD"
   exec pg_restore --exit-on-error --no-owner --no-privileges \
     -h postgres -U "$POSTGRES_USER" -d "$1"' \
  sh "$target_database"
printf 'Restore completed into isolated database %s.\n' "$target_database"