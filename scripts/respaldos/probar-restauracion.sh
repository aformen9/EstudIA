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
  grep -E '^COPY "(auth|storage)"\."[a-z0-9_]+" \(' "$carpeta/data.sql" |
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
if ! {
  cat "$carpeta/roles.sql"
  cat "$raiz/supabase/migrations/20261103120000_privilegios_por_defecto.sql"
  cat "$carpeta/schema.sql"
  echo "set session_replication_role = replica;"
  cat "$carpeta/data.sql"
} | psql_como postgres >/dev/null; then
  echo "::error::La restauración falló (arriba, solo el código de error)."
  exit 1
fi
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
