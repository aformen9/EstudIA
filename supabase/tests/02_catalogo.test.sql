-- Políticas de universidades, carreras, planes, materias y correlativas.
begin;
create extension if not exists pgtap with schema extensions;
select plan(100);

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

-- ana crea cosas, beto es otro alumno, admin es admin.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'ana@test.local'),
  ('00000000-0000-4000-8000-00000000000b', 'beto@test.local'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local');
update public.perfiles set es_admin = true where id = '00000000-0000-4000-8000-0000000000ad';

-- Catálogo pendiente de ana, cargado directo para no depender de las políticas que se prueban.
insert into public.universidades (id, nombre, estado, creado_por) values
  ('10000000-0000-4000-8000-000000000001', 'Uni pendiente de ana', 'pendiente', '00000000-0000-4000-8000-00000000000a');
insert into public.carreras (id, universidad_id, nombre, estado, creado_por) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Carrera pendiente de ana', 'pendiente', '00000000-0000-4000-8000-00000000000a');
insert into public.planes (id, carrera_id, version, estado, creado_por) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'P1', 'pendiente', '00000000-0000-4000-8000-00000000000a');
insert into public.materias (id, plan_id, codigo, nombre, anio) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'PEND1', 'Materia pendiente 1', 1),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'PEND2', 'Materia pendiente 2', 1);
insert into public.correlativas (materia_id, requiere_id, para, condicion) values
  ('40000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'cursar', 'regular');

-- Materias propias de ana en el plan publicado.
insert into public.materias (id, plan_id, codigo, nombre, anio, owner_id)
select '40000000-0000-4000-8000-0000000000a1', p.id, null, 'Optativa de ana', 3, '00000000-0000-4000-8000-00000000000a'
from public.planes p where p.version = '7023';
insert into public.materias (id, plan_id, codigo, nombre, anio, owner_id)
select '40000000-0000-4000-8000-0000000000a2', p.id, 'OPT2', 'Otra optativa de ana', 3, '00000000-0000-4000-8000-00000000000a'
from public.planes p where p.version = '7023';
insert into public.correlativas (materia_id, requiere_id, para, condicion) values
  ('40000000-0000-4000-8000-0000000000a2', '40000000-0000-4000-8000-0000000000a1', 'cursar', 'regular');

/* ---------- universidades ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is((select count(*)::int from public.universidades where sigla = 'UCA'), 1, 'universidades select: alumno ve la publicada');
select is((select count(*)::int from public.universidades where id = '10000000-0000-4000-8000-000000000001'), 1, 'universidades select: creador ve su pendiente');
select lives_ok($$insert into public.universidades (id, nombre) values ('10000000-0000-4000-8000-0000000000a1', 'Nueva de ana')$$, 'universidades insert: alumno crea con los defaults');
select is((select estado from public.universidades where id = '10000000-0000-4000-8000-0000000000a1'), 'pendiente', 'universidades insert: queda pendiente');
select is((select creado_por from public.universidades where id = '10000000-0000-4000-8000-0000000000a1'), '00000000-0000-4000-8000-00000000000a'::uuid, 'universidades insert: creado_por es el usuario');
select throws_ok($$insert into public.universidades (nombre, estado) values ('X', 'publicado')$$, '42501', null, 'universidades insert: alumno no crea publicada');
select throws_ok($$insert into public.universidades (nombre, creado_por) values ('X', '00000000-0000-4000-8000-00000000000b')$$, '42501', null, 'universidades insert: alumno no crea a nombre de otro');
select is(pg_temp.filas($$update public.universidades set nombre = 'Editada' where id = '10000000-0000-4000-8000-000000000001'$$), 1, 'universidades update: creador edita su pendiente');
select throws_ok($$update public.universidades set estado = 'publicado' where id = '10000000-0000-4000-8000-000000000001'$$, '42501', null, 'universidades update: creador no se publica');
select throws_ok($$update public.universidades set creado_por = '00000000-0000-4000-8000-00000000000b' where id = '10000000-0000-4000-8000-000000000001'$$, '42501', null, 'universidades update: creador no la pasa a otro');
select is(pg_temp.filas($$update public.universidades set nombre = 'Hack' where sigla = 'UCA'$$), 0, 'universidades update: alumno no edita una publicada');
select is(pg_temp.filas($$delete from public.universidades where sigla = 'UCA'$$), 0, 'universidades delete: alumno no borra una publicada');
select is(pg_temp.filas($$delete from public.universidades where id = '10000000-0000-4000-8000-0000000000a1'$$), 1, 'universidades delete: creador borra su pendiente');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.universidades where id = '10000000-0000-4000-8000-000000000001'), 0, 'universidades select: otro no ve la pendiente');
select is(pg_temp.filas($$update public.universidades set nombre = 'Hack' where id = '10000000-0000-4000-8000-000000000001'$$), 0, 'universidades update: otro no edita la pendiente');
select is(pg_temp.filas($$delete from public.universidades where id = '10000000-0000-4000-8000-000000000001'$$), 0, 'universidades delete: otro no borra la pendiente');

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is((select count(*)::int from public.universidades where id = '10000000-0000-4000-8000-000000000001'), 1, 'universidades select: admin ve la pendiente');
select lives_ok($$insert into public.universidades (id, nombre, estado) values ('10000000-0000-4000-8000-0000000000ad', 'Del admin', 'publicado')$$, 'universidades insert: admin crea publicada');
select is(pg_temp.filas($$update public.universidades set sede = 'Otra' where id = '10000000-0000-4000-8000-0000000000ad'$$), 1, 'universidades update: admin edita una publicada');
select is(pg_temp.filas($$delete from public.universidades where id = '10000000-0000-4000-8000-0000000000ad'$$), 1, 'universidades delete: admin borra una publicada');

/* ---------- carreras ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is((select count(*)::int from public.carreras where sigla = 'LCD'), 1, 'carreras select: alumno ve la publicada');
select is((select count(*)::int from public.carreras where id = '20000000-0000-4000-8000-000000000001'), 1, 'carreras select: creador ve su pendiente');
select lives_ok($$insert into public.carreras (id, universidad_id, nombre) select '20000000-0000-4000-8000-0000000000a1', u.id, 'Nueva' from public.universidades u where u.sigla = 'UCA'$$, 'carreras insert: alumno crea pendiente');
select is((select estado from public.carreras where id = '20000000-0000-4000-8000-0000000000a1'), 'pendiente', 'carreras insert: queda pendiente');
select throws_ok($$insert into public.carreras (universidad_id, nombre, estado) select u.id, 'X', 'publicado' from public.universidades u where u.sigla = 'UCA'$$, '42501', null, 'carreras insert: alumno no crea publicada');
select is(pg_temp.filas($$update public.carreras set nombre = 'Editada' where id = '20000000-0000-4000-8000-000000000001'$$), 1, 'carreras update: creador edita su pendiente');
select throws_ok($$update public.carreras set estado = 'publicado' where id = '20000000-0000-4000-8000-000000000001'$$, '42501', null, 'carreras update: creador no se publica');
select is(pg_temp.filas($$update public.carreras set nombre = 'Hack' where sigla = 'LCD'$$), 0, 'carreras update: alumno no edita una publicada');
select is(pg_temp.filas($$delete from public.carreras where sigla = 'LCD'$$), 0, 'carreras delete: alumno no borra una publicada');
select is(pg_temp.filas($$delete from public.carreras where id = '20000000-0000-4000-8000-0000000000a1'$$), 1, 'carreras delete: creador borra su pendiente');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.carreras where id = '20000000-0000-4000-8000-000000000001'), 0, 'carreras select: otro no ve la pendiente');

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is((select count(*)::int from public.carreras where id = '20000000-0000-4000-8000-000000000001'), 1, 'carreras select: admin ve la pendiente');
select lives_ok($$insert into public.carreras (id, universidad_id, nombre, estado) select '20000000-0000-4000-8000-0000000000ad', u.id, 'Del admin', 'publicado' from public.universidades u where u.sigla = 'UCA'$$, 'carreras insert: admin crea publicada');
select is(pg_temp.filas($$update public.carreras set sigla = 'X' where id = '20000000-0000-4000-8000-0000000000ad'$$), 1, 'carreras update: admin edita una publicada');
select is(pg_temp.filas($$delete from public.carreras where id = '20000000-0000-4000-8000-0000000000ad'$$), 1, 'carreras delete: admin borra una publicada');

/* ---------- planes ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is((select count(*)::int from public.planes where version = '7023'), 1, 'planes select: alumno ve el publicado');
select is((select count(*)::int from public.planes where id = '30000000-0000-4000-8000-000000000001'), 1, 'planes select: el creador ve su plan pendiente');
select lives_ok($$insert into public.planes (id, carrera_id, version) select '30000000-0000-4000-8000-0000000000a1', c.id, 'NUEVO' from public.carreras c where c.sigla = 'LCD'$$, 'planes insert: alumno crea pendiente');
select is((select nota_aprobacion from public.planes where id = '30000000-0000-4000-8000-0000000000a1'), 4::numeric, 'planes insert: toma la escala por defecto');
select throws_ok($$insert into public.planes (carrera_id, version, estado) select c.id, 'NUEVO2', 'publicado' from public.carreras c where c.sigla = 'LCD'$$, '42501', null, 'planes insert: alumno no crea publicado');
select throws_ok($$insert into public.planes (carrera_id, version) select c.id, '7023' from public.carreras c where c.sigla = 'LCD'$$, '23505', null, 'planes: único por carrera y versión');
select is(pg_temp.filas($$update public.planes set nota_max = 12 where id = '30000000-0000-4000-8000-000000000001'$$), 1, 'planes update: creador edita su pendiente');
select throws_ok($$update public.planes set estado = 'publicado' where id = '30000000-0000-4000-8000-000000000001'$$, '42501', null, 'planes update: creador no se publica');
select is(pg_temp.filas($$update public.planes set nota_max = 12 where version = '7023'$$), 0, 'planes update: alumno no edita uno publicado');
select is(pg_temp.filas($$delete from public.planes where version = '7023'$$), 0, 'planes delete: alumno no borra uno publicado');
select is(pg_temp.filas($$delete from public.planes where id = '30000000-0000-4000-8000-0000000000a1'$$), 1, 'planes delete: creador borra su pendiente');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.planes where id = '30000000-0000-4000-8000-000000000001'), 0, 'planes select: otro alumno no ve un plan pendiente');
select is(pg_temp.filas($$update public.planes set nota_max = 20 where id = '30000000-0000-4000-8000-000000000001'$$), 0, 'planes update: otro no edita el pendiente');
select is(pg_temp.filas($$delete from public.planes where id = '30000000-0000-4000-8000-000000000001'$$), 0, 'planes delete: otro no borra el pendiente');

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is((select count(*)::int from public.planes where id = '30000000-0000-4000-8000-000000000001'), 1, 'planes select: admin ve un plan pendiente');
select lives_ok($$insert into public.planes (id, carrera_id, version, estado) select '30000000-0000-4000-8000-0000000000ad', c.id, 'ADM', 'publicado' from public.carreras c where c.sigla = 'LCD'$$, 'planes insert: admin crea publicado');
select is(pg_temp.filas($$delete from public.planes where id = '30000000-0000-4000-8000-0000000000ad'$$), 1, 'planes delete: admin borra uno publicado');

/* ---------- materias ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is((select count(*)::int from public.materias where codigo = 'GMA0136'), 1, 'materias select: alumno ve el catálogo');
select is((select count(*)::int from public.materias where id = '40000000-0000-4000-8000-0000000000a1'), 1, 'materias select: dueño ve su materia propia');
select is((select count(*)::int from public.materias where id = '40000000-0000-4000-8000-000000000001'), 1, 'materias select: creador ve las de su plan pendiente');
select lives_ok($$insert into public.materias (id, plan_id, nombre, anio, owner_id) select '40000000-0000-4000-8000-0000000000a3', p.id, 'Propia sin código', 1, '00000000-0000-4000-8000-00000000000a' from public.planes p where p.version = '7023'$$, 'materias insert: el dueño crea su materia sin código');
select lives_ok($$insert into public.materias (plan_id, codigo, nombre, anio, owner_id) select p.id, 'GMA0136', 'Propia con código del catálogo', 1, '00000000-0000-4000-8000-00000000000a' from public.planes p where p.version = '7023'$$, 'materias: una propia puede repetir un código del catálogo');
select throws_ok($$insert into public.materias (plan_id, nombre, anio, owner_id) select p.id, 'X', 1, '00000000-0000-4000-8000-00000000000b' from public.planes p where p.version = '7023'$$, '42501', null, 'materias insert: no a nombre de otro');
select throws_ok($$insert into public.materias (plan_id, codigo, nombre, anio) select p.id, 'HACK', 'X', 1 from public.planes p where p.version = '7023'$$, '42501', null, 'materias insert: alumno no agrega al catálogo publicado');
select lives_ok($$insert into public.materias (id, plan_id, codigo, nombre, anio) values ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'PEND3', 'Materia pendiente 3', 1)$$, 'materias insert: creador agrega a su plan pendiente');
select throws_ok($$insert into public.materias (plan_id, nombre, anio) values ('30000000-0000-4000-8000-000000000001', 'Sin código', 1)$$, '23514', null, 'materias: el catálogo no admite código null');
select throws_ok($$insert into public.materias (plan_id, codigo, nombre, anio) values ('30000000-0000-4000-8000-000000000001', 'PEND1', 'Repetida', 1)$$, '23505', null, 'materias: código único dentro del catálogo del plan');
select is(pg_temp.filas($$update public.materias set nombre = 'Editada' where id = '40000000-0000-4000-8000-0000000000a1'$$), 1, 'materias update: el dueño edita su materia');
select is(pg_temp.filas($$update public.materias set nombre = 'Editada' where id = '40000000-0000-4000-8000-000000000001'$$), 1, 'materias update: creador edita las de su plan pendiente');
select is(pg_temp.filas($$update public.materias set nombre = 'Hack' where codigo = 'GMA0136' and owner_id is null$$), 0, 'materias update: alumno no edita el catálogo publicado');
select throws_ok($$update public.materias set owner_id = null, codigo = 'HACK' where id = '40000000-0000-4000-8000-0000000000a1'$$, '42501', null, 'materias update: el dueño no mete su materia al catálogo');
select is(pg_temp.filas($$delete from public.materias where codigo = 'GMA0136' and owner_id is null$$), 0, 'materias delete: alumno no borra el catálogo publicado');
select is(pg_temp.filas($$delete from public.materias where id = '40000000-0000-4000-8000-0000000000a3'$$), 1, 'materias delete: el dueño borra su materia');
select is(pg_temp.filas($$delete from public.materias where id = '40000000-0000-4000-8000-000000000003'$$), 1, 'materias delete: creador borra las de su plan pendiente');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.materias where id = '40000000-0000-4000-8000-0000000000a1'), 0, 'materias select: otro no ve la materia propia ajena');
select is((select count(*)::int from public.materias where id = '40000000-0000-4000-8000-000000000001'), 0, 'materias select: otro no ve las de un plan pendiente');
select is(pg_temp.filas($$update public.materias set nombre = 'Hack' where id = '40000000-0000-4000-8000-0000000000a1'$$), 0, 'materias update: otro no edita la propia ajena');
select is(pg_temp.filas($$delete from public.materias where id = '40000000-0000-4000-8000-0000000000a1'$$), 0, 'materias delete: otro no borra la propia ajena');
select throws_ok($$insert into public.materias (plan_id, nombre, anio, owner_id) values ('30000000-0000-4000-8000-000000000001', 'X', 1, '00000000-0000-4000-8000-00000000000b')$$, '42501', null, 'materias insert: no en un plan que no puede ver');

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is((select count(*)::int from public.materias where id = '40000000-0000-4000-8000-000000000001'), 1, 'materias select: admin ve las de un plan pendiente');
select is((select count(*)::int from public.materias where id = '40000000-0000-4000-8000-0000000000a1'), 0, 'materias select: admin no ve materias propias ajenas');
select is(pg_temp.filas($$update public.materias set area = 'X' where codigo = 'GMA0136' and owner_id is null$$), 1, 'materias update: admin edita el catálogo publicado');

/* ---------- correlativas ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is((select count(*)::int from public.correlativas where materia_id = '40000000-0000-4000-8000-0000000000a2'), 1, 'correlativas select: dueño ve las de su materia');
select lives_ok($$insert into public.correlativas (materia_id, requiere_id, para, condicion) select '40000000-0000-4000-8000-0000000000a1', m.id, 'cursar', 'regular' from public.materias m where m.codigo = 'GMA0136' and m.owner_id is null$$, 'correlativas insert: el dueño agrega a su materia');
select lives_ok($$insert into public.correlativas (materia_id, requiere_id, para, condicion) values ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'rendir', 'aprobada')$$, 'correlativas insert: creador agrega en su plan pendiente');
select throws_ok($$insert into public.correlativas (materia_id, requiere_id, para, condicion) select m.id, '40000000-0000-4000-8000-0000000000a1', 'cursar', 'regular' from public.materias m where m.codigo = 'GMA0136' and m.owner_id is null$$, '42501', null, 'correlativas insert: alumno no toca el catálogo publicado');
select throws_ok($$insert into public.correlativas (materia_id, requiere_id, para, condicion) values ('40000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-000000000001', 'cursar', 'regular')$$, '42501', null, 'correlativas insert: no a una materia de otro plan');
select throws_ok($$insert into public.correlativas (materia_id, requiere_id, para, condicion) values ('40000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000a1', 'rendir', 'regular')$$, '23514', null, 'correlativas: no a sí misma');
select throws_ok($$insert into public.correlativas (materia_id, requiere_id, para, condicion) values ('40000000-0000-4000-8000-0000000000a2', '40000000-0000-4000-8000-0000000000a1', 'rendir', 'otra')$$, '23514', null, 'correlativas: condición inválida');
select is(pg_temp.filas($$update public.correlativas set condicion = 'aprobada' where materia_id = '40000000-0000-4000-8000-0000000000a2'$$), 1, 'correlativas update: el dueño edita la de su materia');
select is(pg_temp.filas($$update public.correlativas c set condicion = 'aprobada' from public.materias m where m.id = c.materia_id and m.owner_id is null and m.plan_id <> '30000000-0000-4000-8000-000000000001'$$), 0, 'correlativas update: alumno no edita las del catálogo publicado');
select is(pg_temp.filas($$delete from public.correlativas c using public.materias m where m.id = c.materia_id and m.owner_id is null and m.plan_id <> '30000000-0000-4000-8000-000000000001'$$), 0, 'correlativas delete: alumno no borra las del catálogo publicado');
select is(pg_temp.filas($$delete from public.correlativas where materia_id = '40000000-0000-4000-8000-0000000000a1'$$), 1, 'correlativas delete: el dueño borra la de su materia');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.correlativas where materia_id = '40000000-0000-4000-8000-0000000000a2'), 0, 'correlativas select: otro no ve las de una materia propia ajena');
select is((select count(*)::int from public.correlativas where materia_id = '40000000-0000-4000-8000-000000000002'), 0, 'correlativas select: otro no ve las de un plan pendiente');
select throws_ok($$insert into public.correlativas (materia_id, requiere_id, para, condicion) values ('40000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000a2', 'rendir', 'regular')$$, '42501', null, 'correlativas insert: otro no agrega a una materia ajena');
select is(pg_temp.filas($$update public.correlativas set condicion = 'regular' where materia_id = '40000000-0000-4000-8000-0000000000a2'$$), 0, 'correlativas update: otro no edita las de una materia ajena');
select is(pg_temp.filas($$delete from public.correlativas where materia_id = '40000000-0000-4000-8000-0000000000a2'$$), 0, 'correlativas delete: otro no borra las de una materia ajena');

-- beto con su propia materia no puede apuntar a la materia propia de ana.
select lives_ok($$insert into public.materias (id, plan_id, nombre, anio, owner_id) select '40000000-0000-4000-8000-0000000000b1', p.id, 'Propia de beto', 1, '00000000-0000-4000-8000-00000000000b' from public.planes p where p.version = '7023'$$, 'beto crea su materia propia');
select throws_ok($$insert into public.correlativas (materia_id, requiere_id, para, condicion) values ('40000000-0000-4000-8000-0000000000b1', '40000000-0000-4000-8000-0000000000a1', 'cursar', 'regular')$$, '42501', null, 'correlativas insert: no a la materia propia de otro');

-- Una vez publicado, el creador deja de poder editar y lo ven todos.
select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is(pg_temp.filas($$update public.planes set estado = 'publicado' where id = '30000000-0000-4000-8000-000000000001'$$), 1, 'planes update: admin publica');
select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.planes where id = '30000000-0000-4000-8000-000000000001'), 1, 'publicado por admin: otro alumno ya lo ve');
select is((select count(*)::int from public.materias where id = '40000000-0000-4000-8000-000000000001'), 1, 'publicado por admin: otro alumno ve sus materias');
select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is(pg_temp.filas($$update public.planes set nota_max = 15 where id = '30000000-0000-4000-8000-000000000001'$$), 0, 'publicado por admin: el creador ya no lo edita');
select is(pg_temp.filas($$update public.materias set nombre = 'Tarde' where id = '40000000-0000-4000-8000-000000000001'$$), 0, 'publicado por admin: el creador ya no edita sus materias');

select pg_temp.como_postgres();
select * from finish();
rollback;
