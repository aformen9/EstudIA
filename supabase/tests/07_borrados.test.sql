-- Borrados que se llevarían datos de alumnos: planes con inscripciones y materias del catálogo.
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

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

create function pg_temp.filas(consulta text) returns int language plpgsql as $$
declare n int;
begin
  execute consulta;
  get diagnostics n = row_count;
  return n;
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'ana@test.local'),
  ('00000000-0000-4000-8000-00000000000b', 'beto@test.local'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local');
update public.perfiles set es_admin = true where id = '00000000-0000-4000-8000-0000000000ad';

insert into public.universidades (id, nombre, estado) values ('10000000-0000-4000-8000-000000000001', 'Uni', 'publicado');
insert into public.carreras (id, universidad_id, nombre, estado) values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Carrera', 'publicado');
insert into public.planes (id, carrera_id, version, estado) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'P1', 'publicado');
insert into public.planes (id, carrera_id, version, estado, creado_por) values
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'P2', 'pendiente', '00000000-0000-4000-8000-00000000000a');
-- Plan con una inscripción y sin progreso ni historial: lo único que lo protege es el RESTRICT.
insert into public.universidades (id, nombre, estado) values ('10000000-0000-4000-8000-000000000003', 'Uni 3', 'publicado');
insert into public.carreras (id, universidad_id, nombre, estado) values ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'Carrera 3', 'publicado');
insert into public.planes (id, carrera_id, version, estado) values ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'P3', 'publicado');
insert into public.materias (id, plan_id, codigo, nombre, anio) values
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000003', 'P3M', 'Materia del plan 3', 1);
insert into public.inscripciones (user_id, plan_id, activa) values
  ('00000000-0000-4000-8000-00000000000b', '30000000-0000-4000-8000-000000000003', true);
insert into public.materias (id, plan_id, codigo, nombre, anio) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'CONPROG', 'Con progreso', 1),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'CONHIST', 'Con historial', 1),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'SINDATOS', 'Sin datos', 1),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000002', 'PEND', 'De plan pendiente', 1);
insert into public.materias (id, plan_id, nombre, anio, owner_id) values
  ('40000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', 'Propia de ana', 1, '00000000-0000-4000-8000-00000000000a');
insert into public.inscripciones (user_id, plan_id, activa) values
  ('00000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000001', true),
  ('00000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000002', false);
insert into public.progreso (user_id, materia_id, estado) values
  ('00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000001', 'aprobada'),
  ('00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-0000000000a1', 'cursando');
insert into public.historial (user_id, materia_id, fecha, tipo, resultado) values
  ('00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000002', '2025-07-01', 'Examen', 'Aprobado'),
  ('00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-0000000000a1', '2025-07-01', 'Examen', 'Aprobado');

/* ---------- Sin cascadas entre universidad, carrera y plan ---------- */

insert into public.universidades (id, nombre, estado, creado_por) values
  ('10000000-0000-4000-8000-000000000004', 'Pendiente de ana', 'pendiente', '00000000-0000-4000-8000-00000000000a'),
  ('10000000-0000-4000-8000-000000000005', 'Publicada', 'publicado', null);
insert into public.carreras (id, universidad_id, nombre, estado, creado_por) values
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'Pendiente de ana', 'pendiente', '00000000-0000-4000-8000-00000000000a'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'Publicada', 'publicado', null);
insert into public.planes (id, carrera_id, version, estado, creado_por) values
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'P4', 'pendiente', '00000000-0000-4000-8000-00000000000a'),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'P5', 'publicado', null);

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select throws_ok($$delete from public.universidades where id = '10000000-0000-4000-8000-000000000004'$$, '23503', null, 'pendiente: el creador no borra una universidad con carreras');
select throws_ok($$delete from public.carreras where id = '20000000-0000-4000-8000-000000000004'$$, '23503', null, 'pendiente: el creador no borra una carrera con planes');
select is(pg_temp.filas($$delete from public.planes where id = '30000000-0000-4000-8000-000000000004'$$), 1, 'pendiente: el creador borra un plan sin inscripciones');
select is(pg_temp.filas($$delete from public.carreras where id = '20000000-0000-4000-8000-000000000004'$$), 1, 'pendiente: el creador borra una carrera sin planes');
select is(pg_temp.filas($$delete from public.universidades where id = '10000000-0000-4000-8000-000000000004'$$), 1, 'pendiente: el creador borra una universidad sin carreras');

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select throws_ok($$delete from public.universidades where id = '10000000-0000-4000-8000-000000000005'$$, '23503', null, 'publicada: admin no borra una universidad con carreras');
select throws_ok($$delete from public.carreras where id = '20000000-0000-4000-8000-000000000005'$$, '23503', null, 'publicada: admin no borra una carrera con planes');
select is((select count(*)::int from public.planes where id = '30000000-0000-4000-8000-000000000005'), 1, 'publicada: el plan sigue');
select is(pg_temp.filas($$delete from public.planes where id = '30000000-0000-4000-8000-000000000005'$$), 1, 'publicada: admin borra un plan sin inscripciones');
select is(pg_temp.filas($$delete from public.carreras where id = '20000000-0000-4000-8000-000000000005'$$), 1, 'publicada: admin borra una carrera sin planes');
select is(pg_temp.filas($$delete from public.universidades where id = '10000000-0000-4000-8000-000000000005'$$), 1, 'publicada: admin borra una universidad sin carreras');

/* ---------- Plan con inscripciones: lo intenta el admin, que no ve los datos de ana ---------- */

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select throws_like($$delete from public.planes where id = '30000000-0000-4000-8000-000000000003'$$, '%inscripciones_plan_id_fkey%', 'plan con inscripciones: admin no lo borra');
select throws_like($$delete from public.carreras where id = '20000000-0000-4000-8000-000000000003'$$, '%planes_carrera_id_fkey%', 'plan con inscripciones: tampoco borrando su carrera');
select throws_like($$delete from public.universidades where id = '10000000-0000-4000-8000-000000000003'$$, '%carreras_universidad_id_fkey%', 'plan con inscripciones: tampoco borrando su universidad');
select is((select count(*)::int from public.planes where id = '30000000-0000-4000-8000-000000000003'), 1, 'plan con inscripciones: sigue existiendo');
select is((select count(*)::int from public.materias where id = '40000000-0000-4000-8000-000000000005'), 1, 'plan con inscripciones: conserva sus materias');
select throws_ok($$delete from public.planes where id = '30000000-0000-4000-8000-000000000001'$$, '23503', null, 'plan con inscripciones y datos de alumnos: admin no lo borra');

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select throws_like($$delete from public.planes where id = '30000000-0000-4000-8000-000000000002'$$, '%inscripciones_plan_id_fkey%', 'plan con inscripciones: su creador no borra el pendiente en el que está inscripto');
select is(pg_temp.filas($$delete from public.inscripciones where plan_id = '30000000-0000-4000-8000-000000000002'$$), 1, 'plan pendiente: el creador se da de baja');
select is(pg_temp.filas($$delete from public.materias where id = '40000000-0000-4000-8000-000000000004'$$), 1, 'materia sin datos: el creador la borra de su plan pendiente');
select is(pg_temp.filas($$delete from public.planes where id = '30000000-0000-4000-8000-000000000002'$$), 1, 'plan sin inscripciones: el creador lo borra');

/* ---------- Materia del catálogo con datos de alumnos ---------- */

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select throws_ok($$delete from public.materias where id = '40000000-0000-4000-8000-000000000001'$$, '23503', 'la materia CONPROG del catálogo tiene progreso o historial de alumnos', 'materia del catálogo con progreso: admin no la borra');
select throws_ok($$delete from public.materias where id = '40000000-0000-4000-8000-000000000002'$$, '23503', 'la materia CONHIST del catálogo tiene progreso o historial de alumnos', 'materia del catálogo con historial: admin no la borra');
select is(pg_temp.filas($$delete from public.materias where id = '40000000-0000-4000-8000-000000000003'$$), 1, 'materia del catálogo sin datos: admin la borra');

/* ---------- Una materia no cambia de dueño ni de plan: así no se elude el trigger de borrado ---------- */

select throws_ok($$update public.materias set owner_id = auth.uid() where id = '40000000-0000-4000-8000-000000000001'$$, '42501', 'una materia no puede cambiar de dueño ni de plan', 'dueño: admin no se pone de dueño de una materia del catálogo');
select throws_ok($$delete from public.materias where id = '40000000-0000-4000-8000-000000000001'$$, '23503', null, 'dueño: después de intentarlo, sigue sin poder borrarla');
select throws_ok($$insert into public.materias (id, plan_id, nombre, anio, owner_id) values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'X', 1, auth.uid()) on conflict (id) do update set owner_id = excluded.owner_id$$, '42501', 'una materia no puede cambiar de dueño ni de plan', 'dueño: tampoco con un upsert');
select throws_ok($$update public.materias set plan_id = '30000000-0000-4000-8000-000000000003' where id = '40000000-0000-4000-8000-000000000001'$$, '42501', 'una materia no puede cambiar de dueño ni de plan', 'plan: admin no mueve una materia a otro plan');
select is(pg_temp.filas($$update public.materias set owner_id = null, plan_id = '30000000-0000-4000-8000-000000000001', area = 'Otra' where id = '40000000-0000-4000-8000-000000000001'$$), 1, 'admin: mandar el mismo dueño y plan al editar sigue andando');

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select throws_ok($$update public.materias set owner_id = '00000000-0000-4000-8000-00000000000b' where id = '40000000-0000-4000-8000-0000000000a1'$$, '42501', 'una materia no puede cambiar de dueño ni de plan', 'dueño: el alumno no le pasa su materia a otro');
select throws_ok($$update public.materias set plan_id = '30000000-0000-4000-8000-000000000003' where id = '40000000-0000-4000-8000-0000000000a1'$$, '42501', 'una materia no puede cambiar de dueño ni de plan', 'plan: el alumno no mueve su materia a otro plan');
select is(pg_temp.filas($$update public.materias set owner_id = auth.uid(), nombre = 'Propia de ana' where id = '40000000-0000-4000-8000-0000000000a1'$$), 1, 'alumno: mandar el mismo dueño al editar sigue andando');

select pg_temp.como_postgres();
set local role service_role;
select throws_ok($$update public.materias set owner_id = '00000000-0000-4000-8000-00000000000a' where id = '40000000-0000-4000-8000-000000000001'$$, '42501', 'una materia no puede cambiar de dueño ni de plan', 'dueño: service_role tampoco');
select throws_ok($$update public.materias set plan_id = '30000000-0000-4000-8000-000000000003' where id = '40000000-0000-4000-8000-000000000001'$$, '42501', 'una materia no puede cambiar de dueño ni de plan', 'plan: service_role tampoco');

select pg_temp.como_postgres();
select is((select owner_id from public.materias where id = '40000000-0000-4000-8000-000000000001'), null, 'dueño: la materia sigue siendo del catálogo');
select is((select plan_id from public.materias where id = '40000000-0000-4000-8000-000000000001'), '30000000-0000-4000-8000-000000000001'::uuid, 'plan: la materia sigue en su plan');

select throws_ok($$delete from public.materias where id = '40000000-0000-4000-8000-000000000001'$$, '23503', null, 'materia del catálogo con progreso: tampoco la borra postgres');
select is((select count(*)::int from public.progreso where materia_id = '40000000-0000-4000-8000-000000000001'), 1, 'materia del catálogo: su progreso sigue intacto');
select is((select count(*)::int from public.historial where materia_id = '40000000-0000-4000-8000-000000000002'), 1, 'materia del catálogo: su historial sigue intacto');

-- Sin inscripciones, el plan sigue protegido por el progreso que cuelga de sus materias.
delete from public.inscripciones where plan_id = '30000000-0000-4000-8000-000000000001';
select throws_ok($$delete from public.planes where id = '30000000-0000-4000-8000-000000000001'$$, '23503', null, 'plan sin inscripciones: no se borra si sus materias del catálogo tienen datos');
select is((select count(*)::int from public.materias where id = '40000000-0000-4000-8000-000000000001'), 1, 'plan sin inscripciones: la cascada fallida no borró nada');
insert into public.inscripciones (user_id, plan_id, activa) values ('00000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000001', true);

/* ---------- Materia propia: se borra normal ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is(pg_temp.filas($$delete from public.materias where id = '40000000-0000-4000-8000-0000000000a1'$$), 1, 'materia propia con datos: su dueño la borra');
select is((select count(*)::int from public.progreso where materia_id = '40000000-0000-4000-8000-0000000000a1'), 0, 'materia propia: se borra su progreso');
select is((select count(*)::int from public.historial where materia_id = '40000000-0000-4000-8000-0000000000a1'), 0, 'materia propia: se borra su historial');

/* ---------- Otro alumno no puede usar el borrado para enterarse de nada ni borrar ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is(pg_temp.filas($$delete from public.materias where id = '40000000-0000-4000-8000-000000000001'$$), 0, 'alumno: la RLS le frena el borrado antes del trigger');
select is(pg_temp.filas($$delete from public.planes where id = '30000000-0000-4000-8000-000000000001'$$), 0, 'alumno: no borra un plan publicado');

/* ---------- Borrar al usuario sigue funcionando y libera sus datos ---------- */

select pg_temp.como_postgres();
select lives_ok($$delete from auth.users where id = '00000000-0000-4000-8000-00000000000a'$$, 'usuario: se puede borrar aunque tenga inscripciones y progreso');
select is((select count(*)::int from public.inscripciones where plan_id = '30000000-0000-4000-8000-000000000001'), 0, 'usuario borrado: se borran sus inscripciones');
select is((select count(*)::int from public.progreso where materia_id = '40000000-0000-4000-8000-000000000001'), 0, 'usuario borrado: se borra su progreso');
select is((select count(*)::int from public.historial where materia_id = '40000000-0000-4000-8000-000000000002'), 0, 'usuario borrado: se borra su historial');

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is(pg_temp.filas($$delete from public.materias where id = '40000000-0000-4000-8000-000000000001'$$), 1, 'materia del catálogo sin datos ya: admin la borra');
select is(pg_temp.filas($$delete from public.planes where id = '30000000-0000-4000-8000-000000000001'$$), 1, 'plan sin inscripciones ni datos: admin lo borra');
select is((select count(*)::int from public.materias where id = '40000000-0000-4000-8000-000000000002'), 0, 'plan borrado: sus materias se van en cascada');

select pg_temp.como_postgres();
select * from finish();
rollback;
