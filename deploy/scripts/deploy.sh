#!/usr/bin/env bash
# Deploy the checked-out, clean revision. This script never fetches or pushes Git.
set -euo pipefail

ENV_FILE=${ENV_FILE:-.env.production}
COMPOSE=(docker compose --env-file "$ENV_FILE")
readonly ENV_FILE COMPOSE

die() {
  printf '%s\n' "deploy: $*" >&2
  exit 1
}

[ -r "$ENV_FILE" ] || die "environment file is not readable: $ENV_FILE"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
  die "run from a Git working tree"
[ -z "$(git status --porcelain)" ] || die "working tree is not clean"
revision=$(git rev-parse --verify HEAD) || die "cannot identify current revision"

printf 'Deploying Git revision %s\n' "$revision"

# Start the database first, then wait through a one-off client on its Compose
# network. No environment file is evaluated by this shell.
"${COMPOSE[@]}" up -d postgres
attempt=0
until "${COMPOSE[@]}" run --rm -T --no-deps postgres sh -ec \
  'export PGPASSWORD="$POSTGRES_PASSWORD"
   pg_isready -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null'; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || die "PostgreSQL did not become ready"
  sleep 2
done

# Idempotent on both new and existing volumes. It provisions distinct runtime
# and migration roles, updates ACLs for existing objects, and verifies login.
"${COMPOSE[@]}" run --rm -T --no-deps postgres \
  bash /docker-entrypoint-initdb.d/10-init-app-role.sh

# Stop the old app before migrations. This accepts a maintenance window instead
# of assuming every schema change is backward-compatible with the old revision.
"${COMPOSE[@]}" build app
"${COMPOSE[@]}" stop app
"${COMPOSE[@]}" --profile operations run --rm -T --no-deps migration
"${COMPOSE[@]}" up -d --no-build app

attempt=0
until "${COMPOSE[@]}" run --rm -T --no-deps app \
  curl --fail --silent --show-error http://app:8080/health >/dev/null &&
  "${COMPOSE[@]}" run --rm -T --no-deps app \
    curl --fail --silent --show-error http://app:8080/ready >/dev/null; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || die "application health/readiness verification failed"
  sleep 2
done

printf 'Deployment completed for Git revision %s; /health and /ready returned success.\n' "$revision"