-- Reportes: topes, autor y fecha fijos, nadie los lee salvo el admin por RPC y el mail solo si se
-- marcó "Pueden contactarme". Métricas: solo para el admin y solo totales.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

create function pg_temp.como(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.como_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;

create function pg_temp.como_postgres() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end $$;

create function pg_temp.reportar(texto text, tipo text default 'problema') returns void language plpgsql as $$
begin
  insert into public.reportes (tipo, texto) values (tipo, texto);
end $$;

create function pg_temp.cuantos(uid uuid) returns int language sql as $$
  select count(*)::int from public.reportes where user_id = uid
$$;

-- Métricas antes de los datos de este test: la base local puede tener datos de desarrollo.
create temporary table antes as select null::jsonb as m;

-- El admin primero, para tomar la foto antes de que existan los dos alumnos del test.
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local');
update public.perfiles set es_admin = true where id = '00000000-0000-4000-8000-0000000000ad';

grant select, update on antes to authenticated;
select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
update antes set m = public.metricas_admin();
select pg_temp.como_postgres();

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'ana@test.local'),
  ('00000000-0000-4000-8000-00000000000b', 'beto@test.local');

/* ---------- Texto ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select lives_ok($$select pg_temp.reportar(repeat('a', 1000))$$, 'texto: 1000 caracteres pasa');
select lives_ok($$select pg_temp.reportar('  ' || repeat('b', 1000) || '  ')$$, 'texto: los espacios de las puntas no cuentan');
select throws_ok($$select pg_temp.reportar(repeat('c', 1001))$$, '23514', null, 'texto: 1001 caracteres se rechaza');
select throws_ok($$select pg_temp.reportar('')$$, '23514', null, 'texto: vacío se rechaza');
select throws_ok($$select pg_temp.reportar('   ')$$, '23514', null, 'texto: solo espacios se rechaza');
select throws_ok($$select pg_temp.reportar('x', 'queja')$$, '23514', null, 'tipo: solo problema o sugerencia');
select throws_ok($$insert into public.reportes (tipo, texto, vista) values ('problema', 'x', repeat('v', 31))$$, '23514', null, 'vista: hasta 30 caracteres');
select throws_ok($$insert into public.reportes (tipo, texto, navegador) values ('problema', 'x', repeat('n', 61))$$, '23514', null, 'navegador: hasta 60 caracteres');

/* ---------- Tope de 5 cada 24 horas ---------- */

select lives_ok($$select pg_temp.reportar('tres', 'sugerencia')$$, 'tope: el tercero pasa');
select lives_ok($$select pg_temp.reportar('cuatro')$$, 'tope: el cuarto pasa');
select lives_ok($$
  insert into public.reportes (tipo, texto, vista, contactable, navegador, sistema, version_app)
  values ('problema', 'cinco', 'materiales', true, 'Safari 18', 'iOS 18', 'abc1234')$$,
  'tope: el quinto pasa, con todos los campos que puede mandar');
select throws_ok($$select pg_temp.reportar('seis')$$, 'EQ005', 'llegaste al máximo de reportes por día', 'tope: el sexto en 24 horas da EQ005');

select pg_temp.como_postgres();
select is(pg_temp.cuantos('00000000-0000-4000-8000-00000000000a'), 5, 'tope: quedaron 5');
update public.reportes set created_at = now() - interval '25 hours'
where id = (select id from public.reportes where user_id = '00000000-0000-4000-8000-00000000000a' order by created_at limit 1);
select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select lives_ok($$select pg_temp.reportar('seis, otro día')$$, 'tope: cuando el más viejo pasa las 24 horas, se puede de nuevo');
select throws_ok($$select pg_temp.reportar('siete')$$, 'EQ005', null, 'tope: y vuelve a cerrarse');

/* ---------- Autor y fecha ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select throws_ok(
  $$insert into public.reportes (user_id, tipo, texto) values ('00000000-0000-4000-8000-00000000000a', 'problema', 'x')$$,
  '42501', null, 'no se reporta a nombre de otro');
select throws_ok(
  $$insert into public.reportes (tipo, texto, created_at) values ('problema', 'x', now() - interval '2 days')$$,
  '42501', null, 'no se elige la fecha');
select lives_ok($$select pg_temp.reportar('de beto')$$, 'el tope es por alumno: beto puede reportar');
select pg_temp.como_postgres();
select is(
  (select created_at > now() - interval '1 minute' from public.reportes where texto = 'de beto'),
  true, 'la fecha la pone el servidor');

/* ---------- Nadie los lee ni los cambia, salvo el admin por RPC ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select throws_ok($$select * from public.reportes$$, '42501', null, 'el alumno no lee reportes, ni los suyos');
select throws_ok($$update public.reportes set texto = 'x'$$, '42501', null, 'el alumno no cambia reportes');
select throws_ok($$delete from public.reportes$$, '42501', null, 'el alumno no borra reportes');
select throws_ok($$select * from public.reportes_admin()$$, '42501', null, 'el alumno no usa reportes_admin');

select pg_temp.como_anon();
select throws_ok($$insert into public.reportes (tipo, texto) values ('problema', 'x')$$, '42501', null, 'anon no reporta');
select throws_ok($$select * from public.reportes$$, '42501', null, 'anon no lee reportes');
select throws_ok($$select * from public.reportes_admin()$$, '42501', null, 'anon no usa reportes_admin');

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select throws_ok($$select * from public.reportes$$, '42501', null, 'el admin tampoco lee la tabla directo');
select is(
  (select count(*)::int from public.reportes_admin(200) where texto in ('cinco', 'tres', 'de beto')),
  3, 'el admin ve los reportes por RPC');
select is(
  (select contacto from public.reportes_admin(200) where texto = 'cinco'),
  'ana@test.local', 'con "Pueden contactarme" ve el mail');
select is(
  (select contacto from public.reportes_admin(200) where texto = 'tres'),
  null, 'sin marcarlo no ve el mail');
select is(
  (select navegador || ' / ' || sistema || ' / ' || version_app || ' / ' || vista from public.reportes_admin(200) where texto = 'cinco'),
  'Safari 18 / iOS 18 / abc1234 / materiales', 've los datos técnicos y la vista');
select is(
  (select count(*)::int from public.reportes_admin(2)), 2, 'reportes_admin respeta el límite');

/* ---------- Métricas ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select throws_ok($$select public.metricas_admin()$$, '42501', null, 'un alumno no ve las métricas');
select pg_temp.como_anon();
select throws_ok($$select public.metricas_admin()$$, '42501', null, 'anon no ve las métricas');

-- Datos conocidos: ana activa el plan, carga dos materias (una con instancias) y una nota.
select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select public.activar_plan((select id from public.planes where version = '7023'));
select public.guardar_materia(
  (select m.id from public.materias m join public.planes p on p.id = m.plan_id
   where p.version = '7023' and m.codigo = 'GMA0136'),
  'aprobada', '[{"tipo": "final", "fecha": "2026-07-10", "nota": 8}]');
select public.guardar_materia(
  (select m.id from public.materias m join public.planes p on p.id = m.plan_id
   where p.version = '7023' and m.codigo = 'GES0132'),
  'cursando', '[]');
insert into public.materiales (tipo, titulo, texto) values ('nota', 'Resumen', 'x');

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
create temporary table despues as select public.metricas_admin() as m;
create function pg_temp.delta(clave text) returns int language sql as $$
  select (select (m ->> clave)::int from despues) - (select (m ->> clave)::int from antes)
$$;
create function pg_temp.delta_material(tipo text) returns int language sql as $$
  select (select (m -> 'materiales' ->> tipo)::int from despues) - (select (m -> 'materiales' ->> tipo)::int from antes)
$$;

select is(pg_temp.delta('alumnos'), 2, 'métricas: 2 alumnos más en total');
select is(pg_temp.delta('alumnosNuevos7Dias'), 2, 'métricas: 2 nuevos en los últimos 7 días');
select is(pg_temp.delta('alumnosConInscripcionActiva'), 1, 'métricas: 1 con inscripción activa');
select is(pg_temp.delta('alumnosConMaterias'), 1, 'métricas: 1 con materias cargadas');
select is(pg_temp.delta('alumnosActivos7Dias'), 1, 'métricas: 1 activo en 7 días (reportar no cuenta)');
select is(pg_temp.delta('materiasConProgreso'), 2, 'métricas: 2 materias con progreso');
select is(pg_temp.delta('instancias'), 1, 'métricas: 1 instancia');
select is(pg_temp.delta_material('nota'), 1, 'métricas: 1 nota');
select is(pg_temp.delta('reportes'), 7, 'métricas: 7 reportes');
select is(
  (select m::text !~ '[0-9a-f]{8}-[0-9a-f]{4}-' from despues), true,
  'métricas: no devuelven ningún id');

select * from finish();
rollback;
