-- anon sin acceso, funciones cerradas, RLS activada y catálogo sembrado.
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

create function pg_temp.como_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;

create function pg_temp.como(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.como_postgres() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end $$;

/* ---------- Estructura ---------- */

select tables_are('public', array[
  'universidades', 'carreras', 'planes', 'materias', 'correlativas', 'perfiles',
  'inscripciones', 'progreso', 'historial', 'documentos', 'limites_documentos', 'uso_documentos', 'materiales', 'denuncias'
], 'están todas las tablas de §4');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'todas las tablas tienen RLS activada');

/* ---------- anon no accede a ninguna tabla ---------- */

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          or has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))),
  0, 'anon no tiene ningún privilegio sobre las tablas');

select pg_temp.como_anon();
select throws_ok('select * from public.universidades', '42501', null, 'anon no lee universidades');
select throws_ok('select * from public.carreras', '42501', null, 'anon no lee carreras');
select throws_ok('select * from public.planes', '42501', null, 'anon no lee planes');
select throws_ok('select * from public.materias', '42501', null, 'anon no lee materias');
select throws_ok('select * from public.correlativas', '42501', null, 'anon no lee correlativas');
select throws_ok('select * from public.perfiles', '42501', null, 'anon no lee perfiles');
select throws_ok('select * from public.inscripciones', '42501', null, 'anon no lee inscripciones');
select throws_ok('select * from public.progreso', '42501', null, 'anon no lee progreso');
select throws_ok('select * from public.historial', '42501', null, 'anon no lee historial');
select throws_ok('select * from public.documentos', '42501', null, 'anon no lee documentos');
select throws_ok('select * from public.limites_documentos', '42501', null, 'anon no lee limites_documentos');
select throws_ok('select * from public.uso_documentos', '42501', null, 'anon no lee uso_documentos');
select throws_ok('select * from public.materiales', '42501', null, 'anon no lee materiales');
select throws_ok('select * from public.denuncias', '42501', null, 'anon no lee denuncias');
select throws_ok($$insert into public.universidades (nombre) values ('X')$$, '42501', null, 'anon no escribe');

/* ---------- anon no ejecuta ninguna función ---------- */

select throws_ok('select public.es_admin()', '42501', null, 'anon no ejecuta es_admin');
select throws_ok('select public.material_compartido(gen_random_uuid())', '42501', null, 'anon no ejecuta material_compartido');
select throws_ok($$select public.registrar_documento(repeat('a', 64))$$, '42501', null, 'anon no ejecuta registrar_documento');
select throws_ok('select public.activar_plan(gen_random_uuid())', '42501', null, 'anon no ejecuta activar_plan');
select throws_ok($$select public.reemplazar_datos_del_plan(gen_random_uuid(), '{}')$$, '42501', null, 'anon no ejecuta reemplazar_datos_del_plan');
select throws_ok($$select public.crear_materia_propia(gen_random_uuid(), gen_random_uuid(), '{}')$$, '42501', null, 'anon no ejecuta crear_materia_propia');
select pg_temp.como_postgres();

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
  0, 'anon no puede ejecutar ninguna función de public');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))),
  0, 'ninguna función de public quedó abierta a PUBLIC');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0, 'authenticated no puede ejecutar funciones de trigger');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not ('search_path=""' = any (coalesce(p.proconfig, '{}')))),
  0, 'toda función security definer tiene search_path vacío');

/* ---------- Lo que se cree después tampoco queda expuesto ---------- */

create table public.tabla_futura (x int);
select is(has_table_privilege('anon', 'public.tabla_futura', 'SELECT'), false, 'anon no recibe privilegios sobre tablas nuevas');
select is(has_table_privilege('authenticated', 'public.tabla_futura', 'SELECT'), false, 'authenticated tampoco sin grant explícito');
drop table public.tabla_futura;

/* ---------- Seed ---------- */

select is((select count(*)::int from public.universidades where sigla = 'UCA' and sede = 'Rosario' and estado = 'publicado'), 1, 'universidad UCA Rosario publicada');
select is((select count(*)::int from public.carreras where sigla = 'LCD' and estado = 'publicado'), 1, 'carrera LCD publicada');
select is((select count(*)::int from public.planes where version = '7023' and estado = 'publicado'), 1, 'plan 7023 publicado');
select is((select nota_min from public.planes where version = '7023'), 1::numeric, 'escala: nota mínima');
select is((select nota_max from public.planes where version = '7023'), 10::numeric, 'escala: nota máxima');
select is((select nota_aprobacion from public.planes where version = '7023'), 4::numeric, 'escala: nota de aprobación');
select is((select cuatrimestres_por_anio from public.planes where version = '7023'), 2, 'dos cuatrimestres por año');
select is((select cierre_cuatrimestres from public.planes where version = '7023'),
  '[{"cuatrimestre":1,"mes":7},{"cuatrimestre":2,"mes":12}]'::jsonb, 'cierre de cuatrimestres de la arquitectura');
-- Solo el catálogo del plan: una base local con datos de desarrollo no tiene que hacer fallar esto.
create function pg_temp.catalogo() returns setof public.materias language sql as $$
  select m.* from public.materias m join public.planes p on p.id = m.plan_id
  where p.version = '7023' and m.owner_id is null
$$;

select is((select count(*)::int from pg_temp.catalogo()), 50, 'el plan tiene 50 materias');
select is((select count(*)::int from public.correlativas where materia_id in (select id from pg_temp.catalogo())), 88, 'hay 88 correlativas');
select is((select count(*)::int from public.correlativas where materia_id in (select id from pg_temp.catalogo()) and para = 'cursar' and condicion = 'regular'), 47, '47 correlativas para cursar con regular');
select is((select count(*)::int from public.correlativas where materia_id in (select id from pg_temp.catalogo()) and para = 'rendir' and condicion = 'aprobada'), 41, '41 correlativas para rendir con aprobada');
select is((select count(*)::int from pg_temp.catalogo() where requiere_anio_completo_para_cursar = 2), 14, 'regla de 2° año en 14 materias');
select is((select count(*)::int from pg_temp.catalogo() where requiere_anio_completo_para_cursar = 2 and anio <> 4), 0, 'la regla de 2° año es solo de 4° año');
select is((select count(*)::int from pg_temp.catalogo() where codigo is null), 0, 'todas las materias del catálogo tienen código');
select is((select count(distinct orden)::int from pg_temp.catalogo()), 50, 'cada materia tiene su orden');
select is((select min(orden) from pg_temp.catalogo()), 1, 'el orden arranca en 1');
select is((select codigo from pg_temp.catalogo() where orden = 1), 'GMA0136', 'orden 1 es la primera materia del fixture');
select is((select codigo from pg_temp.catalogo() where orden = 2), 'GES0132', 'orden 2 es la segunda materia del fixture');
select is(
  (select max(orden) from pg_temp.catalogo() where anio = 0) > 0, true, 'las materias extra también tienen orden');
select is(
  (select count(*)::int from public.correlativas c
   join pg_temp.catalogo() m on m.id = c.materia_id
   join public.materias r on r.id = c.requiere_id
   where m.plan_id <> r.plan_id),
  0, 'las correlativas quedan dentro del plan');

/* ---------- El catálogo se lee con sesión ---------- */

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000a', 'a@test.local');
select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is((select count(*)::int from pg_temp.catalogo()), 50, 'un usuario con sesión ve las 50 materias');
select is((select count(*)::int from public.correlativas where materia_id in (select id from pg_temp.catalogo())), 88, 'un usuario con sesión ve las 88 correlativas');
select pg_temp.como_postgres();

select * from finish();
rollback;
