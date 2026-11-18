# Respaldos

Respaldo diario de la base de producción. Diseño aprobado por Agu el 2026-11-17 (`docs/decisiones.md`).

## Qué hace

`.github/workflows/respaldos.yml` corre todos los días a las 06:17 UTC (03:17 en Argentina) y a mano desde Actions → Respaldos → Run workflow.

1. **Saca el respaldo** con `supabase db dump`, por el Session pooler: `roles.sql`, `schema.sql` y `data.sql`. Los datos incluyen los usuarios de Auth (`auth.users`, `auth.identities`), pero no las sesiones, los tokens ni el registro de actividad (`auth.sessions`, `auth.refresh_tokens`, `auth.mfa_amr_claims`, `auth.one_time_tokens`, `auth.flow_state`, `auth.audit_log_entries`): al restaurar, cada uno vuelve a entrar con Google.
2. **Prueba restaurarlo** en una base Supabase vacía dentro del runner (`scripts/respaldos/probar-restauracion.sh`): compara las filas de cada tabla con las del archivo, comprueba que haya usuarios de Auth y que coincidan con los perfiles, y corre `supabase/verificacion_remoto.sql` (tienen que dar todas "ok"). Si algo falla, no sube nada.
3. **Lo cifra** con la clave pública de age de Agu (`AGE_RECIPIENT`), en un solo archivo `estudia-AAAAMMDDTHHMMSSZ.tar.gz.age`. La clave privada nunca está en GitHub: sin ella, el archivo no se puede abrir.
4. **Lo sube a B2** (`estudia-respaldos-6623d6`, EU Central) con una clave que solo puede escribir: no puede leer, listar ni borrar lo que ya está.

El repo y los logs de Actions son públicos: ningún paso imprime datos (solo tamaños, nombres de tablas y códigos de error), y los archivos sin cifrar nunca salen del runner.

## Retención

Reglas del bucket (B2 las aplica una vez por día):

| Carpeta | Cuándo se sube | Se oculta a los | Se borra después de ocultar |
|---|---|---|---|
| `diarios/` | todos los días | 7 días | 1 día |
| `semanales/` | los domingos (UTC) | 28 días | 1 día |
| `mensuales/` | el día 1 (UTC) | 180 días | 1 día |

Una cuenta borrada puede seguir hasta 6 meses en los respaldos mensuales: lo tiene que decir la política de privacidad.

## Secretos y dónde están

| Qué | Dónde |
|---|---|
| `SUPABASE_DB_URL` (Session pooler, con la contraseña de la base) | GitHub, environment `respaldos` (solo rama `main`) |
| `B2_KEY_ID` y `B2_APPLICATION_KEY` (clave `github-respaldos-v2`: `listBuckets`, `writeFiles`) | GitHub, environment `respaldos` |
| `B2_BUCKET`, `B2_ENDPOINT`, `AGE_RECIPIENT` (no secretos) | variables del environment `respaldos` |
| Clave privada de age (cifrada con frase) y la frase | gestor de contraseñas de Agu, más una copia fuera de línea |
| Master key de B2 | gestor de contraseñas de Agu (solo para crear o borrar claves) |

## Restaurar

Lo mismo sirve para la prueba mensual (en una base local) y para un desastre (en un proyecto nuevo).

**1. Bajar y descifrar** (Agu: es el único con la clave privada).

- Bajar el archivo desde el panel de B2: Buckets → `estudia-respaldos-6623d6` → Browse Files → `diarios/` → el más nuevo → Download.
- Descifrar en una carpeta fuera del repo. Pide la frase de la clave privada:

  ```sh
  mkdir -p ~/restaurar-estudia && cd ~/restaurar-estudia
  age -d -i <archivo-de-la-clave-privada.age> ~/Downloads/estudia-AAAAMMDDTHHMMSSZ.tar.gz.age | tar -xzf -
  ls   # info.txt, roles.sql, schema.sql, data.sql
  ```

  Son datos reales: no se commitean, no se suben a ningún lado y se borran al terminar (paso 4).

**2a. Prueba mensual, en una base local vacía** (con Docker abierto, desde la carpeta del repo):

```sh
prueba="$(mktemp -d)"
mkdir -p "$prueba/supabase"
sed -E -e 's/^project_id = .*/project_id = "restaurar"/' \
  -e 's/^port = 54322/port = 55322/' -e 's/^shadow_port = 54320/shadow_port = 55320/' \
  -e 's/^port = 54329/port = 55329/' -e 's/^port = 54321/port = 55321/' \
  supabase/config.toml >"$prueba/supabase/config.toml"
supabase db start --workdir "$prueba"
scripts/respaldos/probar-restauracion.sh ~/restaurar-estudia supabase_db_restaurar
supabase stop --workdir "$prueba" --no-backup
```

Los puertos cambian para no chocar con el Supabase local del proyecto. Tiene que terminar con `verificacion_remoto.sql: 29 de 29 ok` (o el número de chequeos que tenga ese archivo en ese momento).

**2b. Desastre, en un proyecto nuevo de Supabase.** Es el procedimiento de Supabase ([Backup and restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)), con un agregado nuestro:

- Crear el proyecto y copiar su cadena de conexión del Session pooler (Connect → Session pooler), con la contraseña.
- Restaurar todo o nada, **con la migración de privilegios por defecto antes del esquema**. Hace falta `psql` (`brew install libpq` y seguir lo que indique para el PATH):

  ```sh
  read -rs DB_URL && psql --single-transaction --variable ON_ERROR_STOP=1 \
    --file ~/restaurar-estudia/roles.sql \
    --file supabase/migrations/20261103120000_privilegios_por_defecto.sql \
    --file ~/restaurar-estudia/schema.sql \
    --command 'SET session_replication_role = replica' \
    --file ~/restaurar-estudia/data.sql \
    --dbname "$DB_URL"; unset DB_URL
  ```

  **Por qué la migración:** Supabase da por defecto a `anon` y `authenticated` privilegios sobre toda tabla nueva en `public`, y el respaldo solo trae los `GRANT`, no los `REVOKE` de esos defaults. Sin ella, cada tabla restaurada le da `TRUNCATE`, `REFERENCES`, `TRIGGER` y `MAINTAIN` a `anon` (lo encontró la prueba del 2026-11-18).
- Correr `supabase/verificacion_remoto.sql` en el SQL Editor del proyecto nuevo: todas "ok".
- Volver a configurar lo que no está en la base: Auth con Google (Client ID y secret, Site URL y Redirect URLs), los secretos y el deploy de la Edge Function `estado-servicio`, las variables de Vercel (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) y los monitores de UptimeRobot.
- Si el proyecto nuevo trae una versión de Auth más vieja que la del respaldo, la carga falla con `42703` (falta una columna). En un proyecto nuevo de Supabase no debería pasar (trae la última); en la base local de prueba el script lo resuelve solo.

**3. Qué no está en el respaldo**

- Las sesiones de Auth: todos vuelven a entrar.
- Los archivos de los alumnos: viven en sus dispositivos (fase 0), no en la base.
- La configuración del proyecto: Auth, API keys, secretos de Edge Functions.

**4. Borrar los datos descifrados**

```sh
rm -rf ~/restaurar-estudia ~/Downloads/estudia-*.tar.gz.age
```

## Mantenimiento

- **Prueba mensual** de la restauración (pasos 1, 2a y 4). Registrar la fecha y el resultado en `docs/estado.md`.
- **Si un respaldo falla**, GitHub le manda un mail a quien hizo el último cambio en la programación del workflow. Revisar el log en Actions: muestra solo códigos de error, sin datos.
- **60 días sin actividad en el repo:** GitHub desactiva los workflows programados de un repo público. Reactivarlo desde Actions → Respaldos.
- **Cambiar la clave de B2** una vez por año, o si se filtra: crear otra con la CLI de B2 (`b2 key create --bucket estudia-respaldos-6623d6 <nombre> listBuckets,writeFiles`), reemplazar los dos secretos en GitHub y borrar la anterior.
- **Si cambia la contraseña de la base**, actualizar `SUPABASE_DB_URL` en el environment `respaldos`.
- **Versiones fijas:** las actions van por SHA y la CLI de Supabase en 3.0.0. Al actualizarlas, correr el workflow a mano y revisar el log.
