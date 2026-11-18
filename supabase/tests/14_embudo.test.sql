-- Embudo del onboarding en metricas_admin: registrados → eligieron carrera → cargaron materias →
-- importaron respaldo. Solo totales; importado_en lo llena reemplazar_datos_del_plan.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

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

create function pg_temp.lcd() returns uuid language sql as $$
  select id from public.planes where version = '7023'
$$;

create function pg_temp.materia(cod text) returns uuid language sql as $$
  select m.id from public.materias m
  where m.plan_id = pg_temp.lcd() and m.owner_id is null and m.codigo = cod
$$;

-- La base local puede tener datos de desarrollo: se comparan los totales antes y después.
create temporary table antes as select null::jsonb as m;
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local');
update public.perfiles set es_admin = true where id = '00000000-0000-4000-8000-0000000000ad';
grant select, update on antes to authenticated;
select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
update antes set m = public.metricas_admin();
select pg_temp.como_postgres();

-- a: solo se registra. b: elige carrera. c: además carga una materia. d: además importa un respaldo.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'a@test.local'),
  ('00000000-0000-4000-8000-00000000000b', 'b@test.local'),
  ('00000000-0000-4000-8000-00000000000c', 'c@test.local'),
  ('00000000-0000-4000-8000-00000000000d', 'd@test.local');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select public.activar_plan(pg_temp.lcd());

select pg_temp.como('00000000-0000-4000-8000-00000000000c');
select public.activar_plan(pg_temp.lcd());
select public.guardar_materia(pg_temp.materia('GMA0136'), 'aprobada', '[]');

select pg_temp.como('00000000-0000-4000-8000-00000000000d');
select public.activar_plan(pg_temp.lcd());
select is(
  (select importado_en from public.inscripciones),
  null,
  'importado_en: arranca vacía');
select lives_ok(
  format($$select public.reemplazar_datos_del_plan(%L, %L)$$, pg_temp.lcd(), jsonb_build_object(
    'materiasPropias', '[]'::jsonb,
    'progreso', jsonb_build_array(
      jsonb_build_object('materiaId', pg_temp.materia('GMA0136'), 'estado', 'aprobada', 'instancias', '[]'::jsonb),
      jsonb_build_object('materiaId', pg_temp.materia('GES0132'), 'estado', 'cursando', 'instancias', '[]'::jsonb)))),
  'importar: reemplazar_datos_del_plan sigue funcionando');
select isnt(
  (select importado_en from public.inscripciones where plan_id = pg_temp.lcd()),
  null,
  'importado_en: importar la llena en la inscripción de ese plan');
select is(
  (select count(*)::int from public.progreso),
  2,
  'importar: cargó el progreso del archivo');

-- Un alumno no puede marcar la inscripción de otro (RLS).
select pg_temp.como('00000000-0000-4000-8000-00000000000c');
update public.inscripciones set importado_en = now() where user_id = '00000000-0000-4000-8000-00000000000b';

select pg_temp.como_postgres();
select is(
  (select count(*)::int from public.inscripciones
   where user_id in ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000c')
     and importado_en is not null),
  0,
  'importado_en: no toca a los que no importaron, ni se puede marcar la de otro');

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select throws_ok($$select public.metricas_admin()$$, '42501', null, 'un alumno no ve el embudo');

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
create temporary table despues as select public.metricas_admin() as m;
create function pg_temp.delta(clave text) returns int language sql as $$
  select (select (m -> 'embudo' ->> clave)::int from despues) - (select (m -> 'embudo' ->> clave)::int from antes)
$$;

select is(pg_temp.delta('registrados'), 4, 'embudo: 4 registrados más');
select is(pg_temp.delta('eligieronCarrera'), 3, 'embudo: 3 eligieron carrera');
select is(pg_temp.delta('cargaronMaterias'), 2, 'embudo: 2 cargaron al menos una materia');
select is(pg_temp.delta('importaronRespaldo'), 1, 'embudo: 1 importó un respaldo');
select is(
  (select array_agg(k order by k) from despues, jsonb_object_keys(m -> 'embudo') k),
  array['cargaronMaterias', 'eligieronCarrera', 'importaronRespaldo', 'registrados'],
  'embudo: solo totales, sin datos de alumnos');
select is(
  (select (m ->> 'alumnos')::int from despues),
  (select (m -> 'embudo' ->> 'registrados')::int from despues),
  'embudo: registrados coincide con el total de alumnos');

select * from finish();
rollback;
