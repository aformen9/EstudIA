#!/usr/bin/env bash
# Restaura un respaldo (roles.sql, schema.sql y data.sql) en una base Supabase vacía y comprueba que
# quedó completo. Lo usa .github/workflows/respaldos.yml y sirve igual en local.
#
#   scripts/respaldos/probar-restauracion.sh <carpeta-del-respaldo> <contenedor-de-la-base>
#
# El repo es público y los logs de Actions también: este script NUNCA imprime datos. Solo nombres de
# tablas, de chequeos y códigos de error (SQLSTATE), nunca el mensaje completo de Postgres, que puede
# traer valores de una fila.
set -euo pipefail
# Nunca fallar sin decir dónde: la línea del script, sin datos.
trap 'echo "::error::probar-restauracion.sh falló en la línea $LINENO."' ERR

carpeta="$1"
contenedor="$2"
raiz="$(cd "$(dirname "$0")/../.." && pwd)"

for archivo in roles.sql schema.sql data.sql; do
  if [[ ! -s "$carpeta/$archivo" ]]; then
    echo "::error::Falta $archivo o está vacío."
    exit 1
  fi
done

# psql dentro del contenedor de la base: no depende del cliente de Postgres del runner. Con
# VERBOSITY=sqlstate un error muestra solo su código; SHOW_CONTEXT=never no muestra la fila.
psql_como() {
  docker exec -i "$contenedor" psql -U "$1" -d postgres -X -q -At \
    -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v SHOW_CONTEXT=never
}

# 1. Las tablas de auth y storage las crea Supabase, no el respaldo. Si la base de prueba trae una
#    versión de Auth más vieja que la del proyecto, le faltan columnas y la carga falla (42703).
#    Solo en esta base de prueba se agregan las que falten, como texto: alcanza para cargar y contar.
{
  echo "set client_min_messages = warning;"
  { grep -E '^COPY "(auth|storage)"\."[a-z0-9_]+" \(' "$carpeta/data.sql" || true; } |
  sed -E 's/^COPY ("[^"]+"\."[^"]+") \((.*)\) FROM stdin;$/\1|\2/' |
  while IFS='|' read -r tabla columnas; do
    IFS=',' read -ra lista <<<"$columnas"
    for columna in "${lista[@]}"; do
      echo "alter table $tabla add column if not exists ${columna# } text;"
    done
  done
} | psql_como supabase_admin >/dev/null

# 2. La restauración, como la indica Supabase (todo o nada, sin triggers durante la carga de datos),
#    con un agregado: antes del esquema, la migración que quita los privilegios que Supabase da por
#    defecto a anon y authenticated sobre lo nuevo en public. pg_dump solo escribe los GRANT, así que
#    sin esto cada tabla restaurada le daría TRUNCATE, REFERENCES, TRIGGER y MAINTAIN a anon.
#    Y los arreglos para restaurar sin ser supabase_admin (la guía de Supabase indica los dos
#    primeros): se comentan las líneas de roles.sql que nombran a "supabase_admin" (el rol
#    cli_login_postgres que crea la CLI, ajustes de ese rol) y los `OWNER TO "supabase_admin"` de
#    schema.sql. Sin esto falla con 42501.
docker exec "$contenedor" rm -rf /tmp/restaurar
docker exec "$contenedor" mkdir -p /tmp/restaurar
sed -E 's/^(.*"supabase_admin".*)$/-- \1/' "$carpeta/roles.sql" |
  docker exec -i "$contenedor" sh -c 'cat > /tmp/restaurar/roles.sql'
docker exec -i "$contenedor" sh -c 'cat > /tmp/restaurar/privilegios.sql' \
  <"$raiz/supabase/migrations/20261103120000_privilegios_por_defecto.sql"
sed -E 's/^(.*OWNER TO "supabase_admin".*)$/-- \1/' "$carpeta/schema.sql" |
  docker exec -i "$contenedor" sh -c 'cat > /tmp/restaurar/schema.sql'
docker exec -i "$contenedor" sh -c 'cat > /tmp/restaurar/data.sql' <"$carpeta/data.sql"

# psql dice "psql:/tmp/restaurar/<archivo>:<línea>: ERROR:  <código>". roles.sql y schema.sql son
# solo definiciones (sin datos de alumnos): de esos se muestra la sentencia. De data.sql, nunca.
sentencia() {
  docker exec "$contenedor" sed -n "${2}p" "/tmp/restaurar/$1" | cut -c1-300
}

# 2a. Roles, de a una sentencia: son ajustes de la plataforma (no datos) y en una base nueva algunos
#     no se pueden aplicar sin ser supabase_admin. Lo que falle queda como aviso, con su sentencia.
errores="$(mktemp)"
docker exec "$contenedor" psql -U postgres -d postgres -X -q \
  -v ON_ERROR_STOP=0 -v VERBOSITY=sqlstate -v SHOW_CONTEXT=never \
  -f /tmp/restaurar/roles.sql >/dev/null 2>"$errores" || true
# `|| true`: sin avisos, grep no encuentra nada y con pipefail cortaría el script sin decir nada.
{ grep -oE 'roles\.sql:[0-9]+: ERROR: +[0-9A-Z]+' "$errores" || true; } | while read -r ubicacion; do
  linea="$(echo "$ubicacion" | cut -d: -f2)"
  echo "::warning::No se aplicó $ubicacion — $(sentencia roles.sql "$linea")"
done

# 2b. Esquema y datos: todo o nada.
if ! docker exec "$contenedor" psql -U postgres -d postgres -X -q \
  -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v SHOW_CONTEXT=never --single-transaction \
  -f /tmp/restaurar/privilegios.sql -f /tmp/restaurar/schema.sql \
  -c "set session_replication_role = replica" -f /tmp/restaurar/data.sql >/dev/null 2>"$errores"; then
  ubicacion="$(grep -oE '/tmp/restaurar/[a-z]+\.sql:[0-9]+: ERROR: +[0-9A-Z]+' "$errores" | head -1 || true)"
  echo "::error::La restauración falló: ${ubicacion#/tmp/restaurar/}"
  archivo="$(echo "$ubicacion" | sed -nE 's#^/tmp/restaurar/([a-z]+\.sql):.*#\1#p')"
  linea="$(echo "$ubicacion" | sed -nE 's#^[^:]+:([0-9]+):.*#\1#p')"
  if [[ "$archivo" == "schema.sql" ]] && [[ -n "$linea" ]]; then
    echo "Sentencia: $(sentencia schema.sql "$linea")"
  fi
  [[ -n "$ubicacion" ]] || grep -oE 'ERROR: +[0-9A-Z]+' "$errores" | head -1
  exit 1
fi
docker exec "$contenedor" rm -rf /tmp/restaurar
echo "Restauración: ok."

# 3. Cada tabla del respaldo tiene en la base las mismas filas que en el archivo.
esperadas="$(awk '
  /^COPY / { tabla = $2; filas = 0; adentro = 1; next }
  adentro && /^\\\.$/ { print tabla "|" filas; adentro = 0; next }
  adentro { filas++ }
' "$carpeta/data.sql")"

consulta="$(echo "$esperadas" | while IFS='|' read -r tabla _; do
  echo "select '$tabla' || '|' || count(*) from $tabla union all"
done)"
reales="$(echo "${consulta% union all}" | psql_como postgres)"

distintas="$(diff <(echo "$esperadas" | sort) <(echo "$reales" | sort) | grep -E '^[<>]' | cut -d'|' -f1 | sort -u || true)"
if [[ -n "$distintas" ]]; then
  echo "::error::No coinciden las filas de: $(echo "$distintas" | tr '\n' ' ')"
  exit 1
fi
echo "Filas: las $(echo "$esperadas" | wc -l | tr -d ' ') tablas del respaldo coinciden."

# 4. Que haya alumnos: sin usuarios de Auth, los perfiles no sirven.
if [[ "$(echo "select count(*) > 0 and count(*) = (select count(*) from public.perfiles) from auth.users;" | psql_como postgres)" != "t" ]]; then
  echo "::error::No hay usuarios de Auth, o no coinciden con los perfiles."
  exit 1
fi
echo "Usuarios de Auth y perfiles: ok."

# 5. El mismo chequeo que se corre en el SQL Editor del remoto: permisos, RLS y catálogo.
resultado="$(psql_como postgres <"$raiz/supabase/verificacion_remoto.sql")"
fallas="$(echo "$resultado" | grep -v '|ok$' || true)"
if [[ -n "$fallas" ]]; then
  echo "::error::verificacion_remoto.sql no dio todo ok:"
  echo "$fallas" | cut -d'|' -f1
  exit 1
fi
echo "verificacion_remoto.sql: $(echo "$resultado" | wc -l | tr -d ' ') de $(echo "$resultado" | wc -l | tr -d ' ') ok."
