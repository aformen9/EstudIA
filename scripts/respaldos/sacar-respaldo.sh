#!/usr/bin/env bash
# shellcheck disable=SC2016 # $PGURL se expande adentro del contenedor, ver en_contenedor.
# Saca el respaldo de la base en tres archivos (roles.sql, schema.sql y data.sql), igual que
# `supabase db dump`, pero con el usuario de la URL: el rol de solo lectura `respaldos`.
#
#   SUPABASE_DB_URL=... scripts/respaldos/sacar-respaldo.sh <carpeta> <contenedor-con-pg_dump>
#
# Por qué no `supabase db dump`: la CLI llama siempre a `pg_dump --role "postgres"`, y el rol de solo
# lectura no puede volverse postgres (justamente). Las listas de esquemas y las sustituciones son las
# de la CLI v3.0.0 (apps/cli/src/command-internal/pg-dump.{env,scripts}.ts, licencia MIT), sin el
# `--role`. Corre pg_dump dentro del contenedor de la base de prueba: mismo Postgres 17, sin instalar
# nada en el runner.
#
# Nunca imprime datos: solo los mensajes de pg_dump, que no traen filas.
set -euo pipefail
trap 'echo "::error::sacar-respaldo.sh falló en la línea $LINENO."' ERR

carpeta="$1"
contenedor="$2"
: "${SUPABASE_DB_URL:?Falta SUPABASE_DB_URL}"
mkdir -p "$carpeta"

# Esquemas que mantiene la plataforma o una extensión (CLI: INTERNAL_SCHEMAS).
internos='information_schema|pg_*|_analytics|_realtime|_supavisor|auth|etl|extensions|pgbouncer|realtime|storage|supabase_functions|supabase_migrations|cron|dbdev|graphql|graphql_public|net|pgmq|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault'
# Esquemas sin datos para respaldar (CLI: EXCLUDED_SCHEMAS). auth y storage sí van.
sin_datos='information_schema|pg_*|graphql|graphql_public|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault|etl|extensions|pgbouncer|realtime|supabase_migrations|_analytics|_realtime|_supavisor'
# Roles de la plataforma (CLI: RESERVED_ROLES) y ajustes de rol que sí se restauran (ALLOWED_CONFIGS).
reservados='anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|supabase_.*|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin'
ajustes='pgaudit.*|pgrst.*|session_replication_role|statement_timeout|track_io_timing'

# La URL entra al contenedor como variable de entorno, no como argumento visible.
# Por eso `$PGURL` va entre comillas simples: se expande adentro del contenedor, no acá
# (de ahí el `shellcheck disable=SC2016` del principio).
en_contenedor() {
  docker exec -e PGURL="$SUPABASE_DB_URL" "$contenedor" "$@"
}

# 1. Roles, sin contraseñas.
en_contenedor sh -c 'pg_dumpall --dbname="$PGURL" --roles-only --quote-all-identifier --no-role-passwords --no-comments' |
  sed -E 's/^\\(un)?restrict .*$/-- &/' |
  sed -E "s/^GRANT [A-Z ,]+ ON PARAMETER \".*\" TO \"($reservados)\"([ ;]|$)/-- &/" |
  sed -E "s/^CREATE ROLE \"($reservados)\"/-- &/" |
  sed -E "s/^ALTER ROLE \"($reservados)\"/-- &/" |
  sed -E "s/ (NOSUPERUSER|NOREPLICATION)//g" |
  sed -E "s/^-- (.* SET \"($ajustes)\" .*)/\1/" |
  sed -E "s/GRANT \".*\" TO \"($reservados)\"/-- &/" |
  uniq >"$carpeta/roles.sql"
echo "RESET ALL;" >>"$carpeta/roles.sql"

# 2. Esquema de lo nuestro.
en_contenedor sh -c 'pg_dump --dbname="$PGURL" --schema-only --quote-all-identifier --exclude-schema "$1"' sh "$internos" |
  sed -E 's/^\\(un)?restrict .*$/-- &/' |
  sed -E 's/^CREATE SCHEMA "/CREATE SCHEMA IF NOT EXISTS "/' |
  sed -E 's/^CREATE TABLE "/CREATE TABLE IF NOT EXISTS "/' |
  sed -E 's/^CREATE SEQUENCE "/CREATE SEQUENCE IF NOT EXISTS "/' |
  sed -E 's/^CREATE VIEW "/CREATE OR REPLACE VIEW "/' |
  sed -E 's/^CREATE FUNCTION "/CREATE OR REPLACE FUNCTION "/' |
  sed -E 's/^CREATE TRIGGER "/CREATE OR REPLACE TRIGGER "/' |
  sed -E 's/^CREATE PUBLICATION "supabase_realtime/-- &/' |
  sed -E 's/^CREATE EVENT TRIGGER /-- &/' |
  sed -E 's/^         WHEN TAG IN /-- &/' |
  sed -E 's/^   EXECUTE FUNCTION /-- &/' |
  sed -E 's/^ALTER EVENT TRIGGER /-- &/' |
  sed -E 's/^ALTER PUBLICATION "supabase_realtime_/-- &/' |
  sed -E 's/^ALTER FOREIGN DATA WRAPPER (.+) OWNER TO /-- &/' |
  sed -E 's/^ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"/-- &/' |
  sed -E 's/^GRANT ALL ON FOREIGN DATA WRAPPER (.+) TO "postgres" WITH GRANT OPTION/-- &/' |
  sed -E "s/^GRANT (.+) ON (.+) \"($internos)\"/-- &/" |
  sed -E "s/^REVOKE (.+) ON (.+) \"($internos)\"/-- &/" |
  sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pg_tle").+/\1;/' |
  sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pgsodium").+/\1;/' |
  sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pgmq").+/\1;/' |
  sed -E 's/^COMMENT ON EXTENSION (.+)/-- &/' |
  sed -E 's/^CREATE POLICY "cron_job_/-- &/' |
  sed -E 's/^ALTER TABLE "cron"/-- &/' |
  sed -E 's/^SET transaction_timeout = 0;/-- &/' >"$carpeta/schema.sql"

# 3. Datos, con COPY. Sin el historial de migraciones de la plataforma ni las sesiones, tokens y el
#    registro de actividad de Auth: al restaurar, cada uno vuelve a entrar con Google, y un respaldo
#    filtrado no trae sesiones que se puedan usar.
{
  echo "SET session_replication_role = replica;"
  echo
  en_contenedor sh -c 'pg_dump --dbname="$PGURL" --data-only --quote-all-identifier \
      --exclude-schema "$1" --schema "*" \
      --exclude-table auth.schema_migrations --exclude-table storage.migrations \
      --exclude-table supabase_functions.migrations \
      --exclude-table-data auth.sessions --exclude-table-data auth.refresh_tokens \
      --exclude-table-data auth.mfa_amr_claims --exclude-table-data auth.one_time_tokens \
      --exclude-table-data auth.flow_state --exclude-table-data auth.audit_log_entries \
      --exclude-table-data storage.buckets_vectors --exclude-table-data storage.vector_indexes' \
    sh "$sin_datos" |
    sed -E 's/^\\(un)?restrict .*$/-- &/'
  echo "RESET ALL;"
} >"$carpeta/data.sql"

for archivo in roles.sql schema.sql data.sql; do
  if [[ ! -s "$carpeta/$archivo" ]]; then
    echo "::error::$archivo quedó vacío."
    exit 1
  fi
done
# Solo tamaños: nunca el contenido.
wc -c "$carpeta"/*.sql
