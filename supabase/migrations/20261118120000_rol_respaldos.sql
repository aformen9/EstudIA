-- Rol de solo lectura para el respaldo diario (.github/workflows/respaldos.yml), en lugar de la
-- contraseña de postgres en GitHub (decisión del 2026-11-17, backlog §2).
--
-- - Lee todo, también auth: pg_read_all_data da SELECT en todas las tablas y secuencias, y
--   BYPASSRLS hace que la RLS no le esconda filas (pg_dump lo exige).
-- - No escribe nada: no tiene otros permisos, y además sus sesiones arrancan en solo lectura.
-- - No puede crear roles ni bases ni volverse otro rol: no es miembro de postgres.
-- - La contraseña no va en el repo: la pone Agu con `\password respaldos` (docs/respaldos.md).
--   Sin contraseña no puede entrar.

create role respaldos with
  login
  bypassrls
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication
  connection limit 2;

grant pg_read_all_data to respaldos;

alter role respaldos set default_transaction_read_only = on;
