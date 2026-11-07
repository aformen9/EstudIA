-- GRANT explícitos: el proyecto remoto se crea con "Automatically expose new tables" desactivado, así
-- que sin ellos la app no lee nada. Las listas son exactas. Fallan estos tests si, en public:
-- - authenticated gana o pierde un privilegio sobre una tabla o vista, entera;
-- - authenticated o PUBLIC tienen un GRANT por columna fuera de la lista;
-- - una función queda ejecutable por authenticated, o sin ejecutar, y no está en su lista;
-- - authenticated tiene algún privilegio sobre una secuencia;
-- - anon tiene cualquier privilegio; o service_role pierde alguno.
-- No miran las políticas de RLS: de eso se ocupan los demás tests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

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
           where n.nspname = 'public' and c.relkind = 'r'
             and c.relname not in ('limites_documentos', 'uso_documentos') loop
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

/* ---------- limites_documentos y uso_documentos: sin acceso desde la API ---------- */

select is(
  (select count(*)::int
   from unnest(array['authenticated', 'anon']) r
   cross join unnest(array['public.limites_documentos', 'public.uso_documentos']) t
   where has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege(r, t, 'SELECT,INSERT,UPDATE,REFERENCES')),
  0, 'authenticated y anon no tienen ningún privilegio sobre las tablas de límites');

select ok((select relrowsecurity from pg_class where oid = 'public.limites_documentos'::regclass), 'limites_documentos tiene RLS activa');
select ok((select relrowsecurity from pg_class where oid = 'public.uso_documentos'::regclass), 'uso_documentos tiene RLS activa');

set local role authenticated;
select throws_ok('select * from public.limites_documentos', '42501', null, 'authenticated no lee limites_documentos');
select throws_ok('update public.limites_documentos set max_bytes_texto = 999999999', '42501', null, 'authenticated no cambia limites_documentos');
select throws_ok('select * from public.uso_documentos', '42501', null, 'authenticated no lee uso_documentos');
select throws_ok('delete from public.uso_documentos', '42501', null, 'authenticated no borra uso_documentos para recuperar cuota');
select throws_ok($$insert into public.uso_documentos (user_id, documento_id, bytes) values (gen_random_uuid(), gen_random_uuid(), 1)$$, '42501', null, 'authenticated no escribe uso_documentos');
reset role;

set local role anon;
select throws_ok('select * from public.limites_documentos', '42501', null, 'anon no lee limites_documentos');
select throws_ok('update public.limites_documentos set max_bytes_texto = 999999999', '42501', null, 'anon no cambia limites_documentos');
select throws_ok('select * from public.uso_documentos', '42501', null, 'anon no lee uso_documentos');
select throws_ok('delete from public.uso_documentos', '42501', null, 'anon no borra uso_documentos');
reset role;

/* ---------- GRANT por columna: has_table_privilege no los ve ---------- */

select is(
  (select coalesce(array_agg(x order by x collate "C"), '{}')
   from (
     select c.relname || '.' || a.attname || ': ' || acl.privilege_type as x
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join pg_attribute a on a.attrelid = c.oid
     cross join lateral aclexplode(a.attacl) acl
     where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped
       and acl.grantee in ('authenticated'::regrole::oid, 0)
   ) columnas),
  array['perfiles.avatar_url: UPDATE', 'perfiles.nombre: UPDATE'],
  'los únicos GRANT por columna son estos');

/* ---------- authenticated: secuencias ---------- */

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname::text collate "C"), '{}')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     -- El CASE fija el orden: esta función falla si le llega un objeto que no es una secuencia.
     and case when c.relkind = 'S' then has_sequence_privilege('authenticated', c.oid, 'USAGE,SELECT,UPDATE') else false end),
  '{}'::text[],
  'authenticated no usa ninguna secuencia');

/* ---------- authenticated: funciones ---------- */

select is(
  (select array_agg(x order by x collate "C") from pg_temp.funciones('authenticated') x),
  array[
    'activar_plan',
    'correlativa_permitida',
    'crear_materia_propia',
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

-- Toda función que authenticated no ejecuta tiene que estar acá a propósito. Son funciones de trigger,
-- que Postgres dispara sin pedir EXECUTE, y la de la columna generada de documentos.
select is(
  (select array_agg(p.proname::text order by p.proname::text collate "C")
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  array[
    'crear_perfil',
    'documento_texto_tsv',
    'materia_normalizar_codigo',
    'materia_proteger_datos_de_alumnos',
    'materia_proteger_dueno_y_plan',
    'material_cambio_de_materia_a_privado',
    'material_fijar_compartido_en',
    'material_proteger_autor',
    'material_proteger_oculto',
    'material_sin_fecha_futura',
    'ocultar_material_denunciado',
    'plan_proteger_materias_propias',
    'poner_updated_at'
  ],
  'authenticated no ejecuta exactamente estas funciones');

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
select is(pg_temp.leer_todas_las_tablas(), 12, 'authenticated consulta las 12 tablas con grant sin error de permisos');
reset role;

select * from finish();
rollback;
