-- GRANT explícitos: el proyecto remoto se crea con "Automatically expose new tables" desactivado, así
-- que sin ellos la app no lee nada. Las listas son exactas: un objeto nuevo sin su GRANT, o con de más,
-- hace fallar estos tests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create function pg_temp.privilegios(rol text) returns setof text language sql as $$
  select c.relname || ': ' || string_agg(p, ',' order by p collate "C")
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join unnest(array['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']) p
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and has_table_privilege(rol, c.oid, p)
  group by c.relname
$$;

create function pg_temp.funciones(rol text) returns setof text language sql as $$
  select p.proname::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and has_function_privilege(rol, p.oid, 'EXECUTE')
$$;

create function pg_temp.leer_todas_las_tablas() returns int language plpgsql as $$
declare
  t text;
  leidas int := 0;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('select count(*) from public.%I', t);
    leidas := leidas + 1;
  end loop;
  return leidas;
end $$;

/* ---------- El esquema ---------- */

select ok(has_schema_privilege('authenticated', 'public', 'USAGE'), 'authenticated puede usar el esquema public');
select ok(has_schema_privilege('service_role', 'public', 'USAGE'), 'service_role puede usar el esquema public');

/* ---------- authenticated: tablas ---------- */

select is(
  (select array_agg(x order by x collate "C") from pg_temp.privilegios('authenticated') x),
  array[
    'carreras: DELETE,INSERT,SELECT,UPDATE',
    'correlativas: DELETE,INSERT,SELECT,UPDATE',
    'denuncias: INSERT,SELECT',
    'documentos: SELECT',
    'historial: DELETE,INSERT,SELECT,UPDATE',
    'inscripciones: DELETE,INSERT,SELECT,UPDATE',
    'materiales: DELETE,INSERT,SELECT,UPDATE',
    'materias: DELETE,INSERT,SELECT,UPDATE',
    'perfiles: SELECT',
    'planes: DELETE,INSERT,SELECT,UPDATE',
    'progreso: DELETE,INSERT,SELECT,UPDATE',
    'universidades: DELETE,INSERT,SELECT,UPDATE'
  ],
  'authenticated tiene exactamente estos privilegios sobre las tablas');

select is(
  (select coalesce(array_agg(a.attname::text order by a.attname::text collate "C"), '{}')
   from pg_attribute a
   where a.attrelid = 'public.perfiles'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')),
  array['avatar_url', 'nombre'],
  'de perfiles, authenticated solo actualiza nombre y avatar_url');

select is(
  (select coalesce(array_agg(a.attname::text order by a.attname::text collate "C"), '{}')
   from pg_attribute a
   where a.attrelid = 'public.perfiles'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT')),
  '{}'::text[],
  'authenticated no inserta perfiles: los crea el trigger');

/* ---------- authenticated: funciones ---------- */

select is(
  (select array_agg(x order by x collate "C") from pg_temp.funciones('authenticated') x),
  array[
    'activar_plan',
    'correlativa_permitida',
    'cursa_o_curso',
    'documento_propio',
    'es_admin',
    'materia_editable',
    'materia_visible',
    'material_compartido',
    'material_visible',
    'plan_editable',
    'plan_visible',
    'puede_registrar_en_materia',
    'reemplazar_datos_del_plan',
    'registrar_documento'
  ],
  'authenticated ejecuta exactamente estas funciones');

/* ---------- anon: nada ---------- */

select is_empty($$select * from pg_temp.privilegios('anon')$$, 'anon no tiene privilegios sobre ninguna tabla ni vista');
select is_empty($$select * from pg_temp.funciones('anon')$$, 'anon no ejecuta ninguna función');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and (select bool_or(has_any_column_privilege('anon', c.oid, p)) from unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) p)
     and c.relkind in ('r', 'p', 'v', 'm', 'f')),
  0, 'anon tampoco tiene privilegios por columna');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     -- El CASE fija el orden: esta función falla si le llega un objeto que no es una secuencia.
     and case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE') else false end),
  0, 'anon no usa ninguna secuencia');

/* ---------- service_role: los procesos del servidor siguen funcionando ---------- */

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
   where n.nspname = 'public' and c.relkind = 'r' and not has_table_privilege('service_role', c.oid, p)),
  0, 'service_role lee y escribe todas las tablas');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and not has_function_privilege('service_role', p.oid, 'EXECUTE')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
  0, 'service_role ejecuta todas las funciones');

/* ---------- Comprobación real: entrar como authenticated y leer ---------- */

set local role authenticated;
select is(pg_temp.leer_todas_las_tablas(), 12, 'authenticated consulta las 12 tablas sin error de permisos');
reset role;

select * from finish();
rollback;
