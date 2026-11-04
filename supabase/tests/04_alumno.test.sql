-- inscripciones, activar_plan, progreso e historial.
begin;
create extension if not exists pgtap with schema extensions;
select plan(61);

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

-- Otro plan publicado, de otra carrera, y uno pendiente de beto.
insert into public.universidades (id, nombre, estado) values ('10000000-0000-4000-8000-000000000001', 'Otra uni', 'publicado');
insert into public.carreras (id, universidad_id, nombre, estado) values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Otra carrera', 'publicado');
insert into public.planes (id, carrera_id, version, estado) values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'OTRO', 'publicado');
insert into public.planes (id, carrera_id, version, estado, creado_por) values ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'PEND', 'pendiente', '00000000-0000-4000-8000-00000000000b');
insert into public.materias (id, plan_id, codigo, nombre, anio) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'OTRA1', 'Materia de otra carrera', 1);

create function pg_temp.lcd() returns uuid language sql as $$ select id from public.planes where version = '7023' $$;
create function pg_temp.materia(cod text) returns uuid language sql as $$
  select m.id from public.materias m join public.planes p on p.id = m.plan_id
  where p.version = '7023' and m.owner_id is null and m.codigo = cod
$$;

-- Materia propia de cada alumno en LCD, y de ana en un plan donde no está inscripta.
insert into public.materias (id, plan_id, nombre, anio, owner_id) values
  ('40000000-0000-4000-8000-0000000000a1', pg_temp.lcd(), 'Propia de ana', 1, '00000000-0000-4000-8000-00000000000a'),
  ('40000000-0000-4000-8000-0000000000a2', '30000000-0000-4000-8000-000000000001', 'Propia de ana en otro plan', 1, '00000000-0000-4000-8000-00000000000a'),
  ('40000000-0000-4000-8000-0000000000b1', pg_temp.lcd(), 'Propia de beto', 1, '00000000-0000-4000-8000-00000000000b');

/* ---------- inscripciones ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select lives_ok($$insert into public.inscripciones (plan_id, activa) values (pg_temp.lcd(), true)$$, 'inscripciones insert: se inscribe a un plan publicado');
select is((select count(*)::int from public.inscripciones), 1, 'inscripciones select: ve la propia');
select throws_ok($$insert into public.inscripciones (user_id, plan_id) values ('00000000-0000-4000-8000-00000000000b', pg_temp.lcd())$$, '42501', null, 'inscripciones insert: no a nombre de otro');
select throws_ok($$insert into public.inscripciones (plan_id) values ('30000000-0000-4000-8000-000000000002')$$, '42501', null, 'inscripciones insert: no a un plan pendiente ajeno');
select throws_ok($$insert into public.inscripciones (plan_id) values (pg_temp.lcd())$$, '23505', null, 'inscripciones: único por usuario y plan');
select throws_ok($$insert into public.inscripciones (plan_id, activa) values ('30000000-0000-4000-8000-000000000001', true)$$, '23505', null, 'inscripciones: como mucho una activa por usuario');
select lives_ok($$insert into public.inscripciones (plan_id, activa) values ('30000000-0000-4000-8000-000000000001', false)$$, 'inscripciones: una segunda inactiva sí se puede');
select is(pg_temp.filas($$update public.inscripciones set activa = false where plan_id = '30000000-0000-4000-8000-000000000001'$$), 1, 'inscripciones update: edita la propia');
select is(pg_temp.filas($$delete from public.inscripciones where plan_id = '30000000-0000-4000-8000-000000000001'$$), 1, 'inscripciones delete: borra la propia');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.inscripciones), 0, 'inscripciones select: no ve las de otro');
select is(pg_temp.filas($$update public.inscripciones set activa = false where user_id = '00000000-0000-4000-8000-00000000000a'$$), 0, 'inscripciones update: no modifica las de otro');
select is(pg_temp.filas($$delete from public.inscripciones where user_id = '00000000-0000-4000-8000-00000000000a'$$), 0, 'inscripciones delete: no borra las de otro');

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is((select count(*)::int from public.inscripciones), 0, 'inscripciones select: tampoco admin ve las ajenas');

/* ---------- activar_plan ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((public.activar_plan(pg_temp.lcd())).activa, true, 'activar_plan: inscribe y deja activa');
select is((select count(*)::int from public.inscripciones where activa), 1, 'activar_plan: una activa');
select is((public.activar_plan('30000000-0000-4000-8000-000000000001')).plan_id, '30000000-0000-4000-8000-000000000001'::uuid, 'activar_plan: devuelve la inscripción del plan pedido');
select is((select plan_id from public.inscripciones where activa), '30000000-0000-4000-8000-000000000001'::uuid, 'activar_plan: el nuevo es el único activo');
select is((select count(*)::int from public.inscripciones), 2, 'activar_plan: conserva la inscripción anterior');
select is((public.activar_plan(pg_temp.lcd())).plan_id, pg_temp.lcd(), 'activar_plan: reactiva una existente sin duplicar');
select is((select count(*)::int from public.inscripciones), 2, 'activar_plan: sigue habiendo dos inscripciones');
select is((select plan_id from public.inscripciones where activa), pg_temp.lcd(), 'activar_plan: la reactivada es la única activa');
select is((public.activar_plan(pg_temp.lcd())).activa, true, 'activar_plan: repetir no falla');
select is((public.activar_plan('30000000-0000-4000-8000-000000000002')).activa, true, 'activar_plan: funciona sobre el plan pendiente propio');

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select throws_ok($$select public.activar_plan('30000000-0000-4000-8000-000000000002')$$, '42501', null, 'activar_plan: no sobre un plan pendiente ajeno');
select is((select plan_id from public.inscripciones where activa), pg_temp.lcd(), 'activar_plan: si falla, la activa anterior queda intacta');

/* ---------- progreso: decisión 4 ---------- */

select lives_ok($$insert into public.progreso (materia_id, estado) values (pg_temp.materia('GMA0136'), 'cursando')$$, 'progreso insert: materia de un plan con inscripción');
select lives_ok($$insert into public.progreso (materia_id, estado) values ('40000000-0000-4000-8000-0000000000a1', 'aprobada')$$, 'progreso insert: materia propia');
select lives_ok($$insert into public.progreso (materia_id, estado) values ('40000000-0000-4000-8000-0000000000a2', 'final')$$, 'progreso insert: materia propia en un plan sin inscripción');
select throws_ok($$insert into public.progreso (materia_id, estado) values ('40000000-0000-4000-8000-000000000001', 'cursando')$$, '42501', null, 'progreso insert: materia de un plan sin inscripción');
select throws_ok($$insert into public.progreso (materia_id, estado) values ('40000000-0000-4000-8000-0000000000b1', 'cursando')$$, '42501', null, 'progreso insert: materia propia ajena aunque esté inscripta en el plan');
select throws_ok($$insert into public.progreso (user_id, materia_id, estado) values ('00000000-0000-4000-8000-00000000000b', pg_temp.materia('GMA0136'), 'cursando')$$, '42501', null, 'progreso insert: no a nombre de otro');
select throws_ok($$update public.progreso set materia_id = '40000000-0000-4000-8000-000000000001' where materia_id = pg_temp.materia('GMA0136')$$, '42501', null, 'progreso update: no mueve la fila a una materia de un plan sin inscripción');
select throws_ok($$update public.progreso set user_id = '00000000-0000-4000-8000-00000000000b' where materia_id = pg_temp.materia('GMA0136')$$, '42501', null, 'progreso update: no regala la fila a otro');
select is(pg_temp.filas($$update public.progreso set estado = 'final', nota_cursada = 7 where materia_id = pg_temp.materia('GMA0136')$$), 1, 'progreso update: edita el propio');
select lives_ok($$insert into public.progreso (materia_id, estado, nota) values (pg_temp.materia('GMA0136'), 'aprobada', 8) on conflict (user_id, materia_id) do update set estado = excluded.estado, nota = excluded.nota$$, 'progreso: upsert por materia, como guarda la web');
select is((select nota from public.progreso where materia_id = pg_temp.materia('GMA0136')), 8::numeric, 'progreso: el upsert guardó la nota');
select is((select aplazos from public.progreso where materia_id = pg_temp.materia('GMA0136')), '{}'::numeric[], 'progreso: aplazos arranca vacío');
select throws_ok($$update public.progreso set estado = 'inventado' where materia_id = pg_temp.materia('GMA0136')$$, '23514', null, 'progreso: estado inválido');
select is((select count(*)::int from public.progreso), 3, 'progreso select: ve los propios');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.progreso), 0, 'progreso select: no ve el de otro');
select is(pg_temp.filas($$update public.progreso set nota = 1 where user_id = '00000000-0000-4000-8000-00000000000a'$$), 0, 'progreso update: no modifica el de otro');
select is(pg_temp.filas($$delete from public.progreso where user_id = '00000000-0000-4000-8000-00000000000a'$$), 0, 'progreso delete: no borra el de otro');

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is((select count(*)::int from public.progreso), 0, 'progreso select: tampoco admin ve el de otro');

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is(pg_temp.filas($$delete from public.progreso where materia_id = '40000000-0000-4000-8000-0000000000a2'$$), 1, 'progreso delete: borra el propio');

/* ---------- historial ---------- */

select lives_ok($$insert into public.historial (id, materia_id, fecha, tipo, nota, resultado) values ('50000000-0000-4000-8000-000000000001', pg_temp.materia('GMA0136'), '2025-07-01', 'Examen', 8, 'Aprobado')$$, 'historial insert: propio');
select is((select fuente from public.historial where id = '50000000-0000-4000-8000-000000000001'), 'manual', 'historial: fuente por defecto manual');
select is((select count(*)::int from public.historial), 1, 'historial select: ve el propio');
select throws_ok($$insert into public.historial (user_id, materia_id, fecha, tipo, resultado) values ('00000000-0000-4000-8000-00000000000b', pg_temp.materia('GMA0136'), '2025-07-01', 'Examen', 'Aprobado')$$, '42501', null, 'historial insert: no a nombre de otro');
select throws_ok($$insert into public.historial (materia_id, fecha, tipo, resultado) values (pg_temp.materia('GMA0136'), '2025-07-01', 'Otro', 'Aprobado')$$, '23514', null, 'historial: tipo inválido');
select throws_ok($$insert into public.historial (materia_id, fecha, tipo, resultado) values (pg_temp.materia('GMA0136'), '2025-07-01', 'Examen', 'Otro')$$, '23514', null, 'historial: resultado inválido');
select throws_ok($$insert into public.historial (materia_id, fecha, tipo, resultado, fuente) values (pg_temp.materia('GMA0136'), '2025-07-01', 'Examen', 'Aprobado', 'otra')$$, '23514', null, 'historial: fuente inválida');
select is(pg_temp.filas($$update public.historial set nota = 9 where id = '50000000-0000-4000-8000-000000000001'$$), 1, 'historial update: edita el propio');
select throws_ok($$update public.historial set user_id = '00000000-0000-4000-8000-00000000000b' where id = '50000000-0000-4000-8000-000000000001'$$, '42501', null, 'historial update: no regala la fila a otro');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.historial), 0, 'historial select: no ve el de otro');
select is(pg_temp.filas($$update public.historial set nota = 1 where id = '50000000-0000-4000-8000-000000000001'$$), 0, 'historial update: no modifica el de otro');
select is(pg_temp.filas($$delete from public.historial where id = '50000000-0000-4000-8000-000000000001'$$), 0, 'historial delete: no borra el de otro');

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is(pg_temp.filas($$delete from public.historial where id = '50000000-0000-4000-8000-000000000001'$$), 1, 'historial delete: borra el propio');

/* ---------- Cascada desde materias ---------- */

select lives_ok($$insert into public.historial (materia_id, fecha, tipo, resultado) values ('40000000-0000-4000-8000-0000000000a1', '2025-07-01', 'Examen', 'Aprobado')$$, 'historial sobre materia propia');
select is(pg_temp.filas($$delete from public.materias where id = '40000000-0000-4000-8000-0000000000a1'$$), 1, 'borra la materia propia');
select is((select count(*)::int from public.progreso where materia_id = '40000000-0000-4000-8000-0000000000a1'), 0, 'borrar la materia borra su progreso');
select is((select count(*)::int from public.historial where materia_id = '40000000-0000-4000-8000-0000000000a1'), 0, 'borrar la materia borra su historial');

select pg_temp.como_postgres();
select * from finish();
rollback;
