-- Links y fechas de materiales, un material en varias materias, mover material e idempotencia con id
-- generado por el cliente.
begin;
create extension if not exists pgtap with schema extensions;
select plan(125);

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

create function pg_temp.materia(cod text) returns uuid language sql as $$
  select m.id from public.materias m join public.planes p on p.id = m.plan_id
  where p.version = '7023' and m.owner_id is null and m.codigo = cod
$$;

create function pg_temp.lcd() returns uuid language sql as $$ select id from public.planes where version = '7023' $$;

-- ana es la autora. beto cursa GMA0136 y GES0132.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'ana@test.local'),
  ('00000000-0000-4000-8000-00000000000b', 'beto@test.local'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local');
update public.perfiles set es_admin = true where id = '00000000-0000-4000-8000-0000000000ad';

insert into public.progreso (user_id, materia_id, estado) values
  ('00000000-0000-4000-8000-00000000000b', pg_temp.materia('GMA0136'), 'cursando'),
  ('00000000-0000-4000-8000-00000000000b', pg_temp.materia('GES0132'), 'cursando');

insert into public.materias (id, plan_id, nombre, anio, owner_id) values
  ('40000000-0000-4000-8000-0000000000b1', pg_temp.lcd(), 'Propia de beto', 1, '00000000-0000-4000-8000-00000000000b');

-- Materia de un plan pendiente de beto: ana no la ve.
insert into public.planes (id, carrera_id, version, estado, creado_por)
select '30000000-0000-4000-8000-0000000000b1', c.id, 'PEND-BETO', 'pendiente', '00000000-0000-4000-8000-00000000000b'
from public.carreras c where c.sigla = 'LCD';
insert into public.materias (id, plan_id, codigo, nombre, anio) values
  ('40000000-0000-4000-8000-0000000000b2', '30000000-0000-4000-8000-0000000000b1', 'PEND', 'De plan pendiente', 1);

/* ---------- Links: solo http y https ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select lives_ok($$insert into public.materiales (id, tipo, titulo, url) values ('60000000-0000-4000-8000-000000000001', 'link', 'Con https', 'https://x.test')$$, 'url: https');
select lives_ok($$insert into public.materiales (tipo, titulo, url) values ('link', 'Con http', 'http://x.test')$$, 'url: http');
select lives_ok($$insert into public.materiales (tipo, titulo, url) values ('link', 'En mayúsculas', 'HTTPS://X.TEST')$$, 'url: sin distinguir mayúsculas');
select lives_ok($$insert into public.materiales (tipo, titulo, url) values ('link', 'Mezcla', 'HtTp://x.test')$$, 'url: ni mezcladas');
select throws_ok($$insert into public.materiales (tipo, titulo, url) values ('link', 'X', 'javascript:alert(1)')$$, '23514', null, 'url insert: rechaza javascript:');
select throws_ok($$insert into public.materiales (tipo, titulo, url) values ('link', 'X', 'JAVASCRIPT:alert(1)')$$, '23514', null, 'url insert: rechaza JAVASCRIPT:');
select throws_ok($$insert into public.materiales (tipo, titulo, url) values ('link', 'X', 'javascript:alert(1)//https://x.test')$$, '23514', null, 'url insert: https en el medio no alcanza');
select throws_ok($$insert into public.materiales (tipo, titulo, url) values ('link', 'X', E'javascript:alert(1)\nhttps://x.test')$$, '23514', null, 'url insert: https en otra línea no alcanza');
select throws_ok($$insert into public.materiales (tipo, titulo, url) values ('link', 'X', ' https://x.test')$$, '23514', null, 'url insert: debe empezar con el esquema');
select throws_ok($$insert into public.materiales (tipo, titulo, url) values ('link', 'X', 'data:text/html,x')$$, '23514', null, 'url insert: rechaza data:');
select throws_ok($$insert into public.materiales (tipo, titulo, url) values ('link', 'X', 'ftp://x.test')$$, '23514', null, 'url insert: rechaza ftp:');
select throws_ok($$insert into public.materiales (tipo, titulo, url) values ('link', 'X', 'https:x.test')$$, '23514', null, 'url insert: pide las dos barras');
select throws_ok($$update public.materiales set url = 'javascript:alert(1)' where id = '60000000-0000-4000-8000-000000000001'$$, '23514', null, 'url update: rechaza javascript:');
select is((select url from public.materiales where id = '60000000-0000-4000-8000-000000000001'), 'https://x.test', 'url update: el link sigue como estaba');

/* ---------- Fechas: las futuras se llevan a now(), las pasadas se conservan ---------- */

select lives_ok($$insert into public.materiales (id, tipo, titulo, texto, created_at) values ('60000000-0000-4000-8000-000000000002', 'nota', 'Futura', 'x', now() + interval '10 years')$$, 'fecha futura al insertar: no falla');
select is((select created_at from public.materiales where id = '60000000-0000-4000-8000-000000000002'), now(), 'fecha futura al insertar: queda en now()');
select lives_ok($$insert into public.materiales (id, tipo, titulo, texto, created_at) values ('60000000-0000-4000-8000-000000000003', 'nota', 'Restaurada', 'x', '2024-03-15 12:00:00+00')$$, 'fecha pasada al insertar: no falla');
select is((select created_at from public.materiales where id = '60000000-0000-4000-8000-000000000003'), '2024-03-15 12:00:00+00'::timestamptz, 'fecha pasada al insertar: se conserva');
select is(pg_temp.filas($$update public.materiales set titulo = 'Restaurada 2' where id = '60000000-0000-4000-8000-000000000003'$$), 1, 'fecha: editar otra cosa');
select is((select created_at from public.materiales where id = '60000000-0000-4000-8000-000000000003'), '2024-03-15 12:00:00+00'::timestamptz, 'fecha: editar otra cosa no la cambia');
select is(pg_temp.filas($$update public.materiales set created_at = now() + interval '1 day' where id = '60000000-0000-4000-8000-000000000003'$$), 1, 'fecha futura al editar: no falla');
select is((select created_at from public.materiales where id = '60000000-0000-4000-8000-000000000003'), now(), 'fecha futura al editar: queda en now()');
select is(pg_temp.filas($$update public.materiales set created_at = '2023-01-01 00:00:00+00' where id = '60000000-0000-4000-8000-000000000003'$$), 1, 'fecha pasada al editar: no falla');
select is((select created_at from public.materiales where id = '60000000-0000-4000-8000-000000000003'), '2023-01-01 00:00:00+00'::timestamptz, 'fecha pasada al editar: se conserva');

-- Una fila de un reloj adelantado (cargada a mano) no cambia si se edita otra cosa.
select pg_temp.como_postgres();
alter table public.materiales disable trigger materiales_sin_fecha_futura;
insert into public.materiales (id, user_id, tipo, titulo, texto, created_at) values
  ('60000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-00000000000a', 'nota', 'Adelantada', 'x', now() + interval '1 second');
alter table public.materiales enable trigger materiales_sin_fecha_futura;
select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is(pg_temp.filas($$update public.materiales set oculto = true where id = '60000000-0000-4000-8000-000000000004'$$), 1, 'fecha: una transacción anterior a la fila puede editarla sin mover la fecha');
select is((select created_at from public.materiales where id = '60000000-0000-4000-8000-000000000004'), now() + interval '1 second', 'fecha: la fecha no se movió');

/* ---------- Un material en varias materias ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select lives_ok($$insert into public.materiales (id, materia_id, tipo, titulo, documento_id) values ('60000000-0000-4000-8000-000000000010', pg_temp.materia('GMA0136'), 'archivo', 'En una', public.registrar_documento(repeat('a', 64)))$$, 'varias materias: primera referencia');
select lives_ok($$insert into public.materiales (id, materia_id, tipo, titulo, documento_id, visibilidad) values ('60000000-0000-4000-8000-000000000011', pg_temp.materia('GES0132'), 'archivo', 'En otra', public.registrar_documento(repeat('a', 64)), 'compartido')$$, 'varias materias: otra referencia al mismo documento, compartida');
select lives_ok($$insert into public.materiales (id, materia_id, tipo, titulo, documento_id) values ('60000000-0000-4000-8000-000000000012', pg_temp.materia('GMA0136'), 'archivo', 'Repetido', public.registrar_documento(repeat('a', 64)))$$, 'varias materias: dos veces en la misma materia');
select lives_ok($$insert into public.materiales (id, tipo, titulo, documento_id) values ('60000000-0000-4000-8000-000000000013', 'archivo', 'Sin materia', public.registrar_documento(repeat('a', 64)))$$, 'varias materias: otra referencia sin materia');
select is((select count(distinct documento_id)::int from public.materiales where tipo = 'archivo'), 1, 'varias materias: es un solo documento');
select is((select count(*)::int from public.documentos), 1, 'varias materias: una sola fila en documentos');
select is((select visibilidad from public.materiales where id = '60000000-0000-4000-8000-000000000010'), 'privado', 'varias materias: cada referencia tiene su visibilidad');
select is(pg_temp.filas($$delete from public.materiales where id = '60000000-0000-4000-8000-000000000012'$$), 1, 'varias materias: borrar una referencia');
select is((select count(*)::int from public.materiales where tipo = 'archivo'), 3, 'varias materias: las otras siguen');
select is((select count(*)::int from public.documentos), 1, 'varias materias: el documento sigue visible');

/* ---------- Mover de materia ---------- */

select is(pg_temp.filas($$update public.materiales set materia_id = pg_temp.materia('GMA0136') where id = '60000000-0000-4000-8000-000000000011'$$), 1, 'mover: un compartido cambia de materia');
select is((select visibilidad from public.materiales where id = '60000000-0000-4000-8000-000000000011'), 'privado', 'mover: el compartido pasa a privado');
select is((select materia_id from public.materiales where id = '60000000-0000-4000-8000-000000000011'), pg_temp.materia('GMA0136'), 'mover: queda en la materia nueva');
select is(pg_temp.filas($$update public.materiales set visibilidad = 'compartido' where id = '60000000-0000-4000-8000-000000000011'$$), 1, 'mover: se puede volver a compartir después');
select is(pg_temp.filas($$update public.materiales set materia_id = pg_temp.materia('GES0132'), visibilidad = 'compartido' where id = '60000000-0000-4000-8000-000000000011'$$), 1, 'mover: pedir compartido en el mismo update no falla');
select is((select visibilidad from public.materiales where id = '60000000-0000-4000-8000-000000000011'), 'privado', 'mover: pedir compartido en el mismo update no lo mantiene');
select is(pg_temp.filas($$update public.materiales set visibilidad = 'compartido' where id = '60000000-0000-4000-8000-000000000011'$$), 1, 'sin mover: compartir sigue andando');
select is(pg_temp.filas($$update public.materiales set titulo = 'En otra 2', materia_id = pg_temp.materia('GES0132') where id = '60000000-0000-4000-8000-000000000011'$$), 1, 'sin mover: editar con la misma materia');
select is((select visibilidad from public.materiales where id = '60000000-0000-4000-8000-000000000011'), 'compartido', 'sin mover: con la misma materia sigue compartido');
select is(pg_temp.filas($$update public.materiales set materia_id = pg_temp.materia('GES0132') where id = '60000000-0000-4000-8000-000000000010'$$), 1, 'mover: un privado cambia de materia');
select is((select visibilidad from public.materiales where id = '60000000-0000-4000-8000-000000000010'), 'privado', 'mover: el privado sigue privado');
select throws_ok($$update public.materiales set materia_id = '40000000-0000-4000-8000-0000000000b1' where id = '60000000-0000-4000-8000-000000000010'$$, '42501', null, 'mover: no a la materia propia de otro');
select throws_ok($$update public.materiales set materia_id = '40000000-0000-4000-8000-0000000000b2' where id = '60000000-0000-4000-8000-000000000010'$$, '42501', null, 'mover: no a una materia de un plan que no ve');
select is((select materia_id from public.materiales where id = '60000000-0000-4000-8000-000000000010'), pg_temp.materia('GES0132'), 'mover: lo rechazado no se movió');
select is(pg_temp.filas($$update public.materiales set materia_id = pg_temp.materia('GMA0136'), visibilidad = 'compartido' where id = '60000000-0000-4000-8000-000000000013'$$), 1, 'sin materia: asignarle una y compartirlo juntos es válido');
select is((select visibilidad from public.materiales where id = '60000000-0000-4000-8000-000000000013'), 'compartido', 'sin materia: no estaba compartido, así que se respeta');
select throws_ok($$update public.materiales set materia_id = null, visibilidad = 'compartido' where id = '60000000-0000-4000-8000-000000000010'$$, '23514', null, 'sin materia: un privado no se comparte al sacarle la materia');

/* ---------- Mover un material oculto ---------- */

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is(pg_temp.filas($$update public.materiales set oculto = true where id = '60000000-0000-4000-8000-000000000011'$$), 1, 'oculto: admin oculta el compartido');
select throws_ok($$update public.materiales set materia_id = pg_temp.materia('GMA0136') where id = '60000000-0000-4000-8000-000000000011'$$, '42501', null, 'oculto: admin no mueve material ajeno');

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is(pg_temp.filas($$update public.materiales set materia_id = pg_temp.materia('GMA0136') where id = '60000000-0000-4000-8000-000000000011'$$), 1, 'oculto: el autor lo mueve');
select is((select oculto from public.materiales where id = '60000000-0000-4000-8000-000000000011'), true, 'oculto: mover lo deja oculto');
select is((select visibilidad from public.materiales where id = '60000000-0000-4000-8000-000000000011'), 'privado', 'oculto: y pasa a privado');
select is(pg_temp.filas($$update public.materiales set visibilidad = 'compartido' where id = '60000000-0000-4000-8000-000000000011'$$), 1, 'oculto: el autor lo vuelve a compartir');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.material_compartido(pg_temp.materia('GMA0136')) where id = '60000000-0000-4000-8000-000000000011'), 0, 'oculto: compartido de nuevo, sigue sin verse');
select is((select count(*)::int from public.material_compartido(pg_temp.materia('GMA0136')) where id = '60000000-0000-4000-8000-000000000013'), 1, 'material_compartido: el otro compartido sí se ve');

/* ---------- compartido_en: la fija siempre el servidor ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select lives_ok($$insert into public.materiales (id, tipo, titulo, texto, compartido_en) values ('60000000-0000-4000-8000-000000000030', 'nota', 'Privada', 'x', '2020-01-01')$$, 'compartido_en insert: mandarla en un privado no falla');
select is((select compartido_en from public.materiales where id = '60000000-0000-4000-8000-000000000030'), null, 'compartido_en insert: un privado queda en null');
select lives_ok(format($$insert into public.materiales (id, materia_id, tipo, titulo, texto, visibilidad, compartido_en, created_at) values ('60000000-0000-4000-8000-000000000031', %L, 'nota', 'Vieja, ya compartida', 'x', 'compartido', '2020-01-01', '2020-01-01')$$, pg_temp.materia('GES0132')), 'compartido_en insert: mandarla en un compartido no falla');
select is((select compartido_en from public.materiales where id = '60000000-0000-4000-8000-000000000031'), now(), 'compartido_en insert: un compartido toma now(), con una fecha pasada');
select lives_ok(format($$insert into public.materiales (id, materia_id, tipo, titulo, texto, visibilidad, compartido_en) values ('60000000-0000-4000-8000-000000000032', %L, 'nota', 'Futura', 'x', 'compartido', '2099-01-01')$$, pg_temp.materia('GES0132')), 'compartido_en insert: con una fecha futura tampoco falla');
select is((select compartido_en from public.materiales where id = '60000000-0000-4000-8000-000000000032'), now(), 'compartido_en insert: un compartido toma now(), con una fecha futura');
select is((select created_at from public.materiales where id = '60000000-0000-4000-8000-000000000031'), '2020-01-01'::timestamptz, 'compartido_en insert: created_at se conserva aparte');

select is(pg_temp.filas($$update public.materiales set compartido_en = '2020-01-01' where id = '60000000-0000-4000-8000-000000000030'$$), 1, 'compartido_en update: en un privado no falla');
select is((select compartido_en from public.materiales where id = '60000000-0000-4000-8000-000000000030'), null, 'compartido_en update: un privado sigue en null');

-- Fechas distintas dentro de una misma transacción: se cargan a mano, sin el trigger.
select pg_temp.como_postgres();
alter table public.materiales disable trigger materiales_fijar_compartido_en;
update public.materiales set compartido_en = '2026-06-01 00:00:00+00' where id = '60000000-0000-4000-8000-000000000031';
update public.materiales set compartido_en = '2026-01-01 00:00:00+00' where id = '60000000-0000-4000-8000-000000000032';
alter table public.materiales enable trigger materiales_fijar_compartido_en;

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is(pg_temp.filas($$update public.materiales set compartido_en = '2099-01-01' where id = '60000000-0000-4000-8000-000000000032'$$), 1, 'compartido_en update: en un compartido no falla');
select is((select compartido_en from public.materiales where id = '60000000-0000-4000-8000-000000000032'), '2026-01-01 00:00:00+00'::timestamptz, 'compartido_en update: un compartido conserva la suya');
select is(pg_temp.filas($$update public.materiales set titulo = 'Futura 2' where id = '60000000-0000-4000-8000-000000000032'$$), 1, 'compartido_en update: editar otra cosa');
select is((select compartido_en from public.materiales where id = '60000000-0000-4000-8000-000000000032'), '2026-01-01 00:00:00+00'::timestamptz, 'compartido_en update: editar otra cosa no la cambia');

-- El orden: .031 tiene created_at viejo y se compartió después que .032.
select pg_temp.como('00000000-0000-4000-8000-00000000000b');
create function pg_temp.orden_compartidos() returns uuid[] language sql as $$
  select array_agg(id) from public.material_compartido(pg_temp.materia('GES0132'))
  where id in ('60000000-0000-4000-8000-000000000031', '60000000-0000-4000-8000-000000000032')
$$;
select is(pg_temp.orden_compartidos(), array['60000000-0000-4000-8000-000000000031', '60000000-0000-4000-8000-000000000032']::uuid[], 'material_compartido: ordena por compartido_en, con un created_at viejo');
select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is(pg_temp.filas($$update public.materiales set created_at = '2030-01-01' where id = '60000000-0000-4000-8000-000000000032'$$), 1, 'material_compartido: el autor le adelanta el created_at al otro');
select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is(pg_temp.orden_compartidos(), array['60000000-0000-4000-8000-000000000031', '60000000-0000-4000-8000-000000000032']::uuid[], 'material_compartido: cambiar created_at no cambia el orden');
select is((select compartido_en from public.material_compartido(pg_temp.materia('GES0132')) where id = '60000000-0000-4000-8000-000000000031'), '2026-06-01 00:00:00+00'::timestamptz, 'material_compartido: devuelve compartido_en');
select pg_temp.como_postgres();
select ok((select 'compartido_en' = any (p.proargnames) and not 'created_at' = any (p.proargnames) from pg_proc p where p.oid = 'public.material_compartido'::regproc), 'material_compartido: su firma tiene compartido_en y no created_at');

-- El admin oculta sin cambiarla.
select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is(pg_temp.filas($$update public.materiales set oculto = true where id = '60000000-0000-4000-8000-000000000032'$$), 1, 'compartido_en: admin oculta');
select is((select compartido_en from public.materiales where id = '60000000-0000-4000-8000-000000000032'), '2026-01-01 00:00:00+00'::timestamptz, 'compartido_en: ocultar no la cambia');

-- Volver a privado la borra; compartir de nuevo la vuelve a tomar.
select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is(pg_temp.filas($$update public.materiales set visibilidad = 'privado' where id = '60000000-0000-4000-8000-000000000031'$$), 1, 'compartido_en: vuelve a privado');
select is((select compartido_en from public.materiales where id = '60000000-0000-4000-8000-000000000031'), null, 'compartido_en: al volver a privado queda en null');
select is(pg_temp.filas($$update public.materiales set visibilidad = 'compartido', compartido_en = '2020-01-01' where id = '60000000-0000-4000-8000-000000000031'$$), 1, 'compartido_en: pasa a compartido mandando otra fecha');
select is((select compartido_en from public.materiales where id = '60000000-0000-4000-8000-000000000031'), now(), 'compartido_en: al pasar a compartido toma now()');
select is(pg_temp.filas($$update public.materiales set materia_id = pg_temp.materia('GMA0136'), compartido_en = '2020-01-01' where id = '60000000-0000-4000-8000-000000000031'$$), 1, 'compartido_en: un compartido se mueve de materia');
select is((select visibilidad from public.materiales where id = '60000000-0000-4000-8000-000000000031'), 'privado', 'compartido_en: mover lo pasa a privado');
select is((select compartido_en from public.materiales where id = '60000000-0000-4000-8000-000000000031'), null, 'compartido_en: mover la deja en null');

-- Borrar la materia también: el FK pone materia_id en null.
select lives_ok(format($$insert into public.materias (id, plan_id, nombre, anio, owner_id) values ('40000000-0000-4000-8000-0000000000a8', %L, 'Para borrar', 1, auth.uid())$$, pg_temp.lcd()), 'compartido_en: materia propia para borrar');
select lives_ok($$insert into public.materiales (id, materia_id, tipo, titulo, texto, visibilidad) values ('60000000-0000-4000-8000-000000000033', '40000000-0000-4000-8000-0000000000a8', 'nota', 'Queda sin materia', 'x', 'compartido')$$, 'compartido_en: compartido en esa materia');
select is(pg_temp.filas($$delete from public.materias where id = '40000000-0000-4000-8000-0000000000a8'$$), 1, 'compartido_en: se borra la materia');
select is((select compartido_en from public.materiales where id = '60000000-0000-4000-8000-000000000033'), null, 'compartido_en: borrar la materia la deja en null');

/* ---------- Un material no cambia de autor ---------- */

select throws_ok($$update public.materiales set user_id = '00000000-0000-4000-8000-00000000000b' where id = '60000000-0000-4000-8000-000000000030'$$, '42501', 'un material no puede cambiar de autor', 'autor: el dueño no se lo pasa a otro');
select throws_ok($$insert into public.materiales (id, tipo, titulo, texto) values ('60000000-0000-4000-8000-000000000030', 'nota', 'X', 'x') on conflict (id) do update set user_id = '00000000-0000-4000-8000-00000000000b'$$, '42501', 'un material no puede cambiar de autor', 'autor: tampoco con un upsert');
select is(pg_temp.filas($$update public.materiales set user_id = auth.uid(), titulo = 'Privada' where id = '60000000-0000-4000-8000-000000000030'$$), 1, 'autor: mandar el mismo sigue andando');

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select lives_ok($$insert into public.materiales (id, tipo, titulo, texto) values ('60000000-0000-4000-8000-0000000000a1', 'nota', 'Del admin', 'x')$$, 'autor: admin crea un material');
select throws_ok($$update public.materiales set user_id = '00000000-0000-4000-8000-00000000000a' where id = '60000000-0000-4000-8000-0000000000a1'$$, '42501', 'un material no puede cambiar de autor', 'autor: admin no le atribuye su material a otro');
select throws_ok($$update public.materiales set user_id = auth.uid() where id = '60000000-0000-4000-8000-000000000030'$$, '42501', 'un material no puede cambiar de autor', 'autor: admin no se apropia de uno ajeno');
select is(pg_temp.filas($$update public.materiales set oculto = true where id = '60000000-0000-4000-8000-000000000030'$$), 1, 'autor: admin sigue pudiendo ocultar');
select is(pg_temp.filas($$update public.materiales set oculto = false where id = '60000000-0000-4000-8000-000000000030'$$), 1, 'autor: y mostrar');

select pg_temp.como_postgres();
set local role service_role;
select throws_ok($$update public.materiales set user_id = '00000000-0000-4000-8000-00000000000b' where id = '60000000-0000-4000-8000-000000000030'$$, '42501', 'un material no puede cambiar de autor', 'autor: service_role tampoco');
select pg_temp.como_postgres();
select is((select user_id from public.materiales where id = '60000000-0000-4000-8000-000000000030'), '00000000-0000-4000-8000-00000000000a'::uuid, 'autor: sigue siendo de ana');

/* ---------- Idempotencia: el id lo genera el cliente ---------- */

select pg_temp.como_postgres();
select ok(has_column_privilege('authenticated', 'public.materias', 'id', 'INSERT'), 'id: authenticated puede escribirlo en materias');
select ok(has_column_privilege('authenticated', 'public.materiales', 'id', 'INSERT'), 'id: authenticated puede escribirlo en materiales');

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is(pg_temp.filas(format($$insert into public.materias (id, plan_id, nombre, anio, owner_id) values ('40000000-0000-4000-8000-0000000000a1', %L, 'Propia de ana', 1, auth.uid()) on conflict do nothing$$, pg_temp.lcd())), 1, 'materias: el primer insert crea la fila');
select is(pg_temp.filas(format($$insert into public.materias (id, plan_id, nombre, anio, owner_id) values ('40000000-0000-4000-8000-0000000000a1', %L, 'Reintento distinto', 2, auth.uid()) on conflict do nothing$$, pg_temp.lcd())), 0, 'materias: el reintento no crea otra');
select is((select count(*)::int from public.materias where id = '40000000-0000-4000-8000-0000000000a1'), 1, 'materias: queda una sola fila');
select is((select nombre from public.materias where id = '40000000-0000-4000-8000-0000000000a1'), 'Propia de ana', 'materias: el reintento no pisa nada');

select is(pg_temp.filas($$insert into public.materiales (id, tipo, titulo, texto) values ('60000000-0000-4000-8000-000000000020', 'nota', 'Nota de ana', 'secreto') on conflict do nothing$$), 1, 'materiales: el primer insert crea la fila');
select is(pg_temp.filas($$insert into public.materiales (id, tipo, titulo, texto) values ('60000000-0000-4000-8000-000000000020', 'nota', 'Reintento distinto', 'otro') on conflict do nothing$$), 0, 'materiales: el reintento no crea otra');
select is((select count(*)::int from public.materiales where id = '60000000-0000-4000-8000-000000000020'), 1, 'materiales: queda una sola fila');
select is((select titulo from public.materiales where id = '60000000-0000-4000-8000-000000000020'), 'Nota de ana', 'materiales: el reintento no pisa nada');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is(pg_temp.filas(format($$insert into public.materias (id, plan_id, nombre, anio, owner_id) values ('40000000-0000-4000-8000-0000000000a1', %L, 'Pisada por beto', 1, auth.uid()) on conflict do nothing$$, pg_temp.lcd())), 0, 'materias: otro con el mismo id no crea nada');
select is(pg_temp.filas(format($$insert into public.materias (id, plan_id, nombre, anio, owner_id) values ('40000000-0000-4000-8000-0000000000a1', %L, 'Pisada por beto', 1, auth.uid()) on conflict do nothing returning *$$, pg_temp.lcd())), 0, 'materias: ni le devuelve la fila ajena');
select throws_ok(format($$insert into public.materias (id, plan_id, nombre, anio, owner_id) values ('40000000-0000-4000-8000-0000000000a1', %L, 'Pisada por beto', 1, auth.uid()) on conflict (id) do update set nombre = excluded.nombre$$, pg_temp.lcd()), '42501', null, 'materias: otro no la pisa con un upsert');
select is((select count(*)::int from public.materias where id = '40000000-0000-4000-8000-0000000000a1'), 0, 'materias: otro no la lee');

select is(pg_temp.filas($$insert into public.materiales (id, tipo, titulo, texto) values ('60000000-0000-4000-8000-000000000020', 'nota', 'Pisada por beto', 'x') on conflict do nothing$$), 0, 'materiales: otro con el mismo id no crea nada');
select is(pg_temp.filas($$insert into public.materiales (id, tipo, titulo, texto) values ('60000000-0000-4000-8000-000000000020', 'nota', 'Pisada por beto', 'x') on conflict do nothing returning *$$), 0, 'materiales: ni le devuelve la fila ajena');
select throws_ok($$insert into public.materiales (id, tipo, titulo, texto) values ('60000000-0000-4000-8000-000000000020', 'nota', 'Pisada por beto', 'x') on conflict (id) do update set titulo = excluded.titulo$$, '42501', null, 'materiales: otro no la pisa con un upsert');
select is((select count(*)::int from public.materiales where id = '60000000-0000-4000-8000-000000000020'), 0, 'materiales: otro no la lee');

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is((select nombre from public.materias where id = '40000000-0000-4000-8000-0000000000a1'), 'Propia de ana', 'materias: la fila de ana sigue igual');
select is((select owner_id from public.materias where id = '40000000-0000-4000-8000-0000000000a1'), '00000000-0000-4000-8000-00000000000a'::uuid, 'materias: y sigue siendo suya');
select is((select titulo from public.materiales where id = '60000000-0000-4000-8000-000000000020'), 'Nota de ana', 'materiales: la fila de ana sigue igual');
select is((select texto from public.materiales where id = '60000000-0000-4000-8000-000000000020'), 'secreto', 'materiales: con su contenido');
select is((select user_id from public.materiales where id = '60000000-0000-4000-8000-000000000020'), '00000000-0000-4000-8000-00000000000a'::uuid, 'materiales: y sigue siendo suya');

select pg_temp.como_postgres();
select * from finish();
rollback;
