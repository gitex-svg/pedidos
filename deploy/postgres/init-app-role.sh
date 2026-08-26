#!/usr/bin/env bash
set -Eeuo pipefail

: "${POSTGRES_DB:?}"
: "${POSTGRES_USER:?}"
: "${POSTGRES_PASSWORD:?}"
: "${APP_DB_USER:?}"
: "${APP_DB_PASSWORD:?}"
: "${MIGRATION_DB_USER:?}"
: "${MIGRATION_DB_PASSWORD:?}"

if [ "$POSTGRES_USER" = "$APP_DB_USER" ] ||
   [ "$POSTGRES_USER" = "$MIGRATION_DB_USER" ] ||
   [ "$APP_DB_USER" = "$MIGRATION_DB_USER" ]; then
  printf '%s\n' "database bootstrap, migration, and runtime roles must be distinct" >&2
  exit 1
fi

psql_args=(
  -v ON_ERROR_STOP=1
  --username "$POSTGRES_USER"
  --dbname "$POSTGRES_DB"
  --set=app_user="$APP_DB_USER"
  --set=app_password="$APP_DB_PASSWORD"
  --set=migration_user="$MIGRATION_DB_USER"
  --set=migration_password="$MIGRATION_DB_PASSWORD"
)
if [ ! -S /var/run/postgresql/.s.PGSQL.5432 ]; then
  export PGPASSWORD="$POSTGRES_PASSWORD"
  psql_args+=(--host "${PGHOST:-postgres}")
fi

psql "${psql_args[@]}" <<'SQL'
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
  :'app_user',
  :'app_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
  :'migration_user',
  :'migration_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'migration_user') \gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
  :'app_user',
  :'app_password'
) \gexec
SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
  :'migration_user',
  :'migration_password'
) \gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'migration_user') \gexec
SELECT format('GRANT CREATE ON DATABASE %I TO %I', current_database(), :'migration_user') \gexec

-- Existing pre-role deployments created application objects as the bootstrap
-- superuser. Transfer only application schemas and their objects, never the
-- database or system catalogs.
SELECT format('ALTER SCHEMA %I OWNER TO %I', nspname, :'migration_user')
FROM pg_namespace
WHERE nspname IN ('public', 'drizzle') \gexec

SELECT format(
  'ALTER %s %I.%I OWNER TO %I',
  CASE c.relkind
    WHEN 'r' THEN 'TABLE'
    WHEN 'p' THEN 'TABLE'
    WHEN 'v' THEN 'VIEW'
    WHEN 'm' THEN 'MATERIALIZED VIEW'
    WHEN 'f' THEN 'FOREIGN TABLE'
  END,
  n.nspname,
  c.relname,
  :'migration_user'
)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'drizzle')
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f') \gexec

-- SERIAL/identity sequences follow their owning table. Alter only standalone
-- sequences here, otherwise PostgreSQL rejects the redundant owner change.
SELECT format('ALTER SEQUENCE %I.%I OWNER TO %I', n.nspname, c.relname, :'migration_user')
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'drizzle')
  AND c.relkind = 'S'
  AND NOT EXISTS (
    SELECT 1
    FROM pg_depend d
    WHERE d.objid = c.oid
      AND d.deptype IN ('a', 'i')
  ) \gexec

SELECT format(
  'ALTER %s %I.%I OWNER TO %I',
  CASE t.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END,
  n.nspname,
  t.typname,
  :'migration_user'
)
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typtype IN ('d', 'e') \gexec

SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_user') \gexec
SELECT format('GRANT USAGE, CREATE ON SCHEMA public TO %I', :'migration_user') \gexec
SELECT format(
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I',
  :'app_user'
) \gexec
SELECT format(
  'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I',
  :'app_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
  :'migration_user',
  :'app_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
  :'migration_user',
  :'app_user'
) \gexec
SQL

if [ -S /var/run/postgresql/.s.PGSQL.5432 ]; then
  connection_args=(--dbname "$POSTGRES_DB")
else
  connection_args=(--host "${PGHOST:-postgres}" --dbname "$POSTGRES_DB")
fi
PGPASSWORD="$APP_DB_PASSWORD" psql "${connection_args[@]}" \
  --username "$APP_DB_USER" -v ON_ERROR_STOP=1 -Atqc "SELECT 1" >/dev/null
PGPASSWORD="$MIGRATION_DB_PASSWORD" psql "${connection_args[@]}" \
  --username "$MIGRATION_DB_USER" -v ON_ERROR_STOP=1 -Atqc "SELECT 1" >/dev/null