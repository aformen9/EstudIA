-- materiales, documentos, denuncias, oculto, material sin materia, registrar_documento y material_compartido.
begin;
create extension if not exists pgtap with schema extensions;
select plan(97);

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

-- ana es la autora. beto y cami cursan GMA0136, dani no la cursó, eli solo la tiene pendiente.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', 'ana@test.local', '{"full_name": "Ana"}'),
  ('00000000-0000-4000-8000-00000000000b', 'beto@test.local', '{}'),
  ('00000000-0000-4000-8000-00000000000c', 'cami@test.local', '{}'),
  ('00000000-0000-4000-8000-00000000000d', 'dani@test.local', '{}'),
  ('00000000-0000-4000-8000-00000000000e', 'eli@test.local', '{}'),
  ('00000000-0000-4000-8000-00000000000f', 'fede@test.local', '{}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{}');
update public.perfiles set es_admin = true where id = '00000000-0000-4000-8000-0000000000ad';

insert into public.progreso (user_id, materia_id, estado) values
  ('00000000-0000-4000-8000-00000000000b', pg_temp.materia('GMA0136'), 'cursando'),
  ('00000000-0000-4000-8000-00000000000c', pg_temp.materia('GMA0136'), 'final'),
  ('00000000-0000-4000-8000-00000000000f', pg_temp.materia('GMA0136'), 'aprobada'),
  ('00000000-0000-4000-8000-00000000000e', pg_temp.materia('GMA0136'), 'pendiente');

-- Materia propia de beto y plan pendiente: ana no debería poder colgarles material.
insert into public.materias (id, plan_id, nombre, anio, owner_id)
select '40000000-0000-4000-8000-0000000000b1', p.id, 'Propia de beto', 1, '00000000-0000-4000-8000-00000000000b'
from public.planes p where p.version = '7023';

/* ---------- materiales: lectura y escritura propias ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select lives_ok(format($$insert into public.materiales (id, materia_id, tipo, titulo, texto, visibilidad, periodo) values ('60000000-0000-4000-8000-000000000001', %L, 'nota', 'Compartida con nombre', 'contenido', 'compartido', '2025-2C')$$, pg_temp.materia('GMA0136')), 'materiales insert: nota propia compartida');
select lives_ok(format($$insert into public.materiales (id, materia_id, tipo, titulo, url, visibilidad, anonimo) values ('60000000-0000-4000-8000-000000000002', %L, 'link', 'Compartida anónima', 'https://x.test', 'compartido', true)$$, pg_temp.materia('GMA0136')), 'materiales insert: link propio anónimo');
select lives_ok(format($$insert into public.materiales (id, materia_id, tipo, titulo, texto) values ('60000000-0000-4000-8000-000000000003', %L, 'nota', 'Privada', 'secreto')$$, pg_temp.materia('GMA0136')), 'materiales insert: nota privada');
select lives_ok($$insert into public.materiales (id, tipo, titulo, texto) values ('60000000-0000-4000-8000-000000000004', 'nota', 'Sin materia', 'suelta')$$, 'materiales insert: sin materia');
select is((select count(*)::int from public.materiales), 4, 'materiales select: ve los propios');
select throws_ok($$insert into public.materiales (user_id, tipo, titulo, texto) values ('00000000-0000-4000-8000-00000000000b', 'nota', 'X', 'x')$$, '42501', null, 'materiales insert: no a nombre de otro');
select throws_ok($$insert into public.materiales (materia_id, tipo, titulo, texto) values ('40000000-0000-4000-8000-0000000000b1', 'nota', 'X', 'x')$$, '42501', null, 'materiales insert: no en la materia propia de otro');
select throws_ok($$insert into public.materiales (tipo, titulo) values ('nota', 'Sin texto')$$, '23514', null, 'materiales: una nota necesita texto');
select throws_ok($$insert into public.materiales (tipo, titulo, texto, url) values ('nota', 'Mezcla', 'x', 'https://x.test')$$, '23514', null, 'materiales: una nota no lleva url');
select throws_ok($$insert into public.materiales (tipo, titulo) values ('archivo', 'Sin documento')$$, '23514', null, 'materiales: un archivo necesita documento');
select throws_ok($$insert into public.materiales (tipo, titulo, url) values ('video', 'X', 'https://x.test')$$, '23514', null, 'materiales: tipo inválido');
select is(pg_temp.filas($$update public.materiales set titulo = 'Compartida con nombre' where id = '60000000-0000-4000-8000-000000000001'$$), 1, 'materiales update: edita el propio');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.materiales), 0, 'materiales select: no ve los de otro, ni compartidos');
select is(pg_temp.filas($$update public.materiales set titulo = 'Hack' where id = '60000000-0000-4000-8000-000000000001'$$), 0, 'materiales update: no modifica el de otro');
select is(pg_temp.filas($$delete from public.materiales where id = '60000000-0000-4000-8000-000000000001'$$), 0, 'materiales delete: no borra el de otro');

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is((select count(*)::int from public.materiales where user_id = '00000000-0000-4000-8000-00000000000a'), 4, 'materiales select: admin ve todos');
select throws_ok($$update public.materiales set titulo = 'Del admin' where id = '60000000-0000-4000-8000-000000000001'$$, '42501', null, 'materiales update: sobre material ajeno, admin solo cambia oculto');

/* ---------- Decisión 1: material sin materia ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select throws_ok($$insert into public.materiales (tipo, titulo, texto, visibilidad) values ('nota', 'X', 'x', 'compartido')$$, '23514', null, 'sin materia: no se puede insertar compartido');
select throws_ok($$update public.materiales set visibilidad = 'compartido' where id = '60000000-0000-4000-8000-000000000004'$$, '23514', null, 'sin materia: no se puede pasar a compartido');
select lives_ok(format($$insert into public.materiales (id, materia_id, tipo, titulo, texto, visibilidad) values ('60000000-0000-4000-8000-000000000005', %L, 'nota', 'Para desvincular', 'x', 'compartido')$$, pg_temp.materia('GMA0136')), 'crea un compartido para desvincular');
select is(pg_temp.filas($$update public.materiales set materia_id = null where id = '60000000-0000-4000-8000-000000000005'$$), 1, 'sacarle la materia a un compartido no falla');
select is((select visibilidad from public.materiales where id = '60000000-0000-4000-8000-000000000005'), 'privado', 'sacarle la materia lo pasa a privado');

-- Borrar la materia: el FK pone null y el trigger evita que el CHECK falle.
select pg_temp.como_postgres();
insert into public.materias (id, plan_id, codigo, nombre, anio)
select '40000000-0000-4000-8000-000000000099', p.id, 'BORRAR', 'Materia a borrar', 1 from public.planes p where p.version = '7023';
select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select lives_ok($$insert into public.materiales (id, materia_id, tipo, titulo, texto, visibilidad) values ('60000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000099', 'nota', 'Queda sin materia', 'x', 'compartido')$$, 'crea un compartido en la materia a borrar');
select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is(pg_temp.filas($$delete from public.materias where id = '40000000-0000-4000-8000-000000000099'$$), 1, 'borrar la materia no falla aunque tenga material compartido');
select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is((select materia_id from public.materiales where id = '60000000-0000-4000-8000-000000000006'), null, 'el material sobrevive sin materia');
select is((select visibilidad from public.materiales where id = '60000000-0000-4000-8000-000000000006'), 'privado', 'el material pasa a privado');

/* ---------- Decisión 2: oculto ---------- */

select throws_ok($$insert into public.materiales (tipo, titulo, texto, oculto) values ('nota', 'X', 'x', true)$$, '42501', null, 'oculto: el autor no lo pone en true al insertar');
select throws_ok($$update public.materiales set oculto = true where id = '60000000-0000-4000-8000-000000000003'$$, '42501', null, 'oculto: el autor no lo pone en true al editar');
select is((select oculto from public.materiales where id = '60000000-0000-4000-8000-000000000003'), false, 'oculto: sigue en false');

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is(pg_temp.filas($$update public.materiales set oculto = true where id = '60000000-0000-4000-8000-000000000003'$$), 1, 'oculto: admin oculta material ajeno');
select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select throws_ok($$update public.materiales set oculto = false where id = '60000000-0000-4000-8000-000000000003'$$, '42501', null, 'oculto: el autor no des-oculta lo que ocultó un admin');
select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is(pg_temp.filas($$update public.materiales set oculto = false where id = '60000000-0000-4000-8000-000000000003'$$), 1, 'oculto: admin des-oculta');
select lives_ok($$insert into public.materiales (id, tipo, titulo, texto, oculto) values ('60000000-0000-4000-8000-0000000000ad', 'nota', 'Del admin', 'x', true)$$, 'oculto: admin puede insertarlo en true');
select is(pg_temp.filas($$delete from public.materiales where id = '60000000-0000-4000-8000-000000000006'$$), 1, 'materiales delete: admin borra material ajeno');

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is(pg_temp.filas($$delete from public.materiales where id = '60000000-0000-4000-8000-000000000005'$$), 1, 'materiales delete: borra el propio');

/* ---------- material_compartido ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.material_compartido(pg_temp.materia('GMA0136'))), 2, 'material_compartido: con la materia en curso ve los compartidos');
select pg_temp.como('00000000-0000-4000-8000-00000000000c');
select is((select count(*)::int from public.material_compartido(pg_temp.materia('GMA0136'))), 2, 'material_compartido: con la materia en final también');
select pg_temp.como('00000000-0000-4000-8000-00000000000f');
select is((select count(*)::int from public.material_compartido(pg_temp.materia('GMA0136'))), 2, 'material_compartido: con la materia aprobada también');
select pg_temp.como('00000000-0000-4000-8000-00000000000d');
select is((select count(*)::int from public.material_compartido(pg_temp.materia('GMA0136'))), 0, 'material_compartido: sin progreso no ve nada');
select pg_temp.como('00000000-0000-4000-8000-00000000000e');
select is((select count(*)::int from public.material_compartido(pg_temp.materia('GMA0136'))), 0, 'material_compartido: con la materia pendiente no ve nada');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select autor_nombre from public.material_compartido(pg_temp.materia('GMA0136')) where id = '60000000-0000-4000-8000-000000000001'), 'Ana', 'material_compartido: devuelve el autor si no es anónimo');
select is((select autor_id from public.material_compartido(pg_temp.materia('GMA0136')) where id = '60000000-0000-4000-8000-000000000001'), '00000000-0000-4000-8000-00000000000a'::uuid, 'material_compartido: y su id');
select is((select autor_nombre from public.material_compartido(pg_temp.materia('GMA0136')) where id = '60000000-0000-4000-8000-000000000002'), null, 'material_compartido: nombre null si es anónimo');
select is((select autor_id from public.material_compartido(pg_temp.materia('GMA0136')) where id = '60000000-0000-4000-8000-000000000002'), null, 'material_compartido: id null si es anónimo');
select is((select count(*)::int from public.material_compartido(pg_temp.materia('GMA0136')) where id = '60000000-0000-4000-8000-000000000003'), 0, 'material_compartido: no devuelve lo privado');
select is((select count(*)::int from public.material_compartido(pg_temp.materia('GES0132'))), 0, 'material_compartido: no devuelve material de otra materia');

/* ---------- denuncias y oculto con 3 denuncias ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000d');
select throws_ok($$insert into public.denuncias (material_id, motivo) values ('60000000-0000-4000-8000-000000000001', 'x')$$, '42501', null, 'denuncias insert: no sobre material que no puede ver');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select throws_ok($$insert into public.denuncias (material_id) values ('60000000-0000-4000-8000-000000000003')$$, '42501', null, 'denuncias insert: no sobre material privado ajeno');
select throws_ok($$insert into public.denuncias (user_id, material_id) values ('00000000-0000-4000-8000-00000000000c', '60000000-0000-4000-8000-000000000001')$$, '42501', null, 'denuncias insert: no a nombre de otro');
select lives_ok($$insert into public.denuncias (material_id, motivo) values ('60000000-0000-4000-8000-000000000001', 'spam')$$, 'denuncias insert: propia sobre material visible');
select throws_ok($$insert into public.denuncias (material_id) values ('60000000-0000-4000-8000-000000000001')$$, '23505', null, 'denuncias: una sola por usuario');
select is((select count(*)::int from public.denuncias), 1, 'denuncias select: ve la propia');
select throws_ok($$update public.denuncias set motivo = 'otro'$$, '42501', null, 'denuncias update: prohibido');
select throws_ok($$delete from public.denuncias$$, '42501', null, 'denuncias delete: prohibido');

select pg_temp.como('00000000-0000-4000-8000-00000000000c');
select is((select count(*)::int from public.denuncias), 0, 'denuncias select: no ve las de otro');
select lives_ok($$insert into public.denuncias (material_id) values ('60000000-0000-4000-8000-000000000001')$$, 'segunda denuncia');
select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is((select oculto from public.materiales where id = '60000000-0000-4000-8000-000000000001'), false, 'con 2 denuncias no se oculta');

select pg_temp.como('00000000-0000-4000-8000-00000000000f');
select lives_ok($$insert into public.denuncias (material_id) values ('60000000-0000-4000-8000-000000000001')$$, 'tercera denuncia: el trigger corre en la sesión de un alumno común');
select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is((select oculto from public.materiales where id = '60000000-0000-4000-8000-000000000001'), true, 'con 3 denuncias queda oculto');
select throws_ok($$update public.materiales set oculto = false where id = '60000000-0000-4000-8000-000000000001'$$, '42501', null, 'oculto: el autor no des-oculta un material denunciado');
select is((select oculto from public.materiales where id = '60000000-0000-4000-8000-000000000001'), true, 'oculto: sigue oculto');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.material_compartido(pg_temp.materia('GMA0136')) where id = '60000000-0000-4000-8000-000000000001'), 0, 'material_compartido: no devuelve lo oculto');
select is((select count(*)::int from public.material_compartido(pg_temp.materia('GMA0136'))), 1, 'material_compartido: sigue devolviendo el resto');

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is((select count(*)::int from public.denuncias where material_id = '60000000-0000-4000-8000-000000000001'), 3, 'denuncias select: admin ve todas');

/* ---------- Decisión 3: registrar_documento ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is(has_table_privilege('authenticated', 'public.documentos', 'INSERT'), false, 'documentos: sin insert directo');
select is(has_table_privilege('authenticated', 'public.documentos', 'UPDATE'), false, 'documentos: sin update directo');
select is(has_table_privilege('authenticated', 'public.documentos', 'DELETE'), false, 'documentos: sin delete directo');
select throws_ok($$insert into public.documentos (sha256) values (repeat('f', 64))$$, '42501', null, 'documentos insert: prohibido');

select lives_ok($$select public.registrar_documento(repeat('a', 64), 'application/pdf', 100, 2, null)$$, 'registrar_documento: crea sin texto');
select lives_ok($$insert into public.materiales (id, materia_id, tipo, titulo, documento_id, visibilidad) values ('60000000-0000-4000-8000-000000000010', pg_temp.materia('GES0132'), 'archivo', 'Archivo compartido', public.registrar_documento(repeat('a', 64)), 'compartido')$$, 'materiales insert: archivo con el id que devuelve el RPC');
select is((select count(*)::int from public.documentos where sha256 = repeat('a', 64)), 1, 'documentos select: ve el que referencia su material');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.documentos), 0, 'documentos select: no ve los que no referencia ni tiene compartidos');
select is(public.registrar_documento(repeat('a', 64), 'text/plain', 1, 1, 'texto inicial'), (select public.registrar_documento(repeat('a', 64))), 'registrar_documento: mismo sha256, mismo id');
select public.registrar_documento(repeat('a', 64), 'text/plain', 1, 1, 'texto pisado');

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is((select texto from public.documentos where sha256 = repeat('a', 64)), 'texto inicial', 'registrar_documento: completa el texto null y no pisa uno existente');
select is((select mime from public.documentos where sha256 = repeat('a', 64)), 'application/pdf', 'registrar_documento: no pisa el mime');
select is((select bytes from public.documentos where sha256 = repeat('a', 64)), 100::bigint, 'registrar_documento: no pisa los bytes');
select is((select count(*)::int from public.documentos where sha256 = repeat('a', 64)), 1, 'registrar_documento: no duplica');
select ok((select texto_tsv @@ to_tsquery('spanish', 'inicial') from public.documentos where sha256 = repeat('a', 64)), 'documentos: texto_tsv se genera con el texto');
select throws_ok($$select public.registrar_documento('no-es-un-hash')$$, '23514', null, 'registrar_documento: rechaza un hash inválido');

/* ---------- El sha256 de un documento ajeno nunca se expone ---------- */

-- ana comparte un archivo cuyo hash beto no conoce. beto cursa la materia, así que ve el material.
select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select lives_ok($$insert into public.materiales (id, materia_id, tipo, titulo, documento_id, visibilidad) values ('60000000-0000-4000-8000-000000000011', pg_temp.materia('GES0132'), 'archivo', 'Archivo de ana', public.registrar_documento(repeat('d', 64), 'application/pdf', 2048, 7, 'texto de ana'), 'compartido')$$, 'ana comparte un archivo');

select pg_temp.como_postgres();
insert into public.progreso (user_id, materia_id, estado) values
  ('00000000-0000-4000-8000-00000000000b', pg_temp.materia('GES0132'), 'cursando');
create temp table documento_de_ana on commit drop as
  select id from public.documentos where sha256 = repeat('d', 64);
grant select on documento_de_ana to authenticated;

select is(
  (select array_agg(a) filter (where a in ('sha256', 'documento_id', 'texto_tsv'))
   from pg_proc p, unnest(p.proargnames) a where p.oid = 'public.material_compartido'::regproc),
  null, 'material_compartido: su firma no tiene sha256 ni documento_id');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select titulo from public.material_compartido(pg_temp.materia('GES0132')) where id = '60000000-0000-4000-8000-000000000011'), 'Archivo de ana', 'material_compartido: beto ve el material compartido de ana');
select is((select documento_mime from public.material_compartido(pg_temp.materia('GES0132')) where id = '60000000-0000-4000-8000-000000000011'), 'application/pdf', 'material_compartido: devuelve el mime del documento');
select is((select documento_bytes from public.material_compartido(pg_temp.materia('GES0132')) where id = '60000000-0000-4000-8000-000000000011'), 2048::bigint, 'material_compartido: devuelve los bytes del documento');
select is((select documento_paginas from public.material_compartido(pg_temp.materia('GES0132')) where id = '60000000-0000-4000-8000-000000000011'), 7, 'material_compartido: devuelve las páginas del documento');
select is((select count(*)::int from public.material_compartido(pg_temp.materia('GES0132')) r where to_jsonb(r)::text like '%' || repeat('d', 64) || '%'), 0, 'material_compartido: el hash no aparece en ningún campo');
select is((select count(*)::int from public.material_compartido(pg_temp.materia('GES0132')) r where to_jsonb(r)::text like '%' || (select id::text from documento_de_ana) || '%'), 0, 'material_compartido: el id del documento tampoco, porque daría acceso a la fila');
select is((select count(*)::int from public.documentos where sha256 = repeat('d', 64)), 0, 'documentos select: no se encuentra un documento ajeno compartido por su hash');
select is((select count(*)::int from public.documentos where id = (select id from documento_de_ana)), 0, 'documentos select: ni por su id');
select is((select count(*)::int from public.documentos), 0, 'documentos select: ver un material compartido no da acceso a ninguna fila');

select pg_temp.como('00000000-0000-4000-8000-00000000000d');
select is((select count(*)::int from public.documentos), 0, 'documentos select: sin cursar la materia tampoco');

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is((select count(*)::int from public.documentos), 0, 'documentos select: admin tampoco lee documentos ajenos');
select is(pg_temp.filas($$update public.materiales set oculto = true where id = '60000000-0000-4000-8000-000000000011'$$), 1, 'admin oculta el archivo');

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is((select sha256 from public.documentos where id = (select id from documento_de_ana)), repeat('d', 64), 'documentos select: la dueña lee el hash de su documento, aunque esté oculto');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.material_compartido(pg_temp.materia('GES0132')) where id = '60000000-0000-4000-8000-000000000011'), 0, 'material_compartido: no devuelve un archivo oculto');

-- Quien sube el mismo archivo lo tiene: se deduplica y pasa a ser dueño de un material que lo referencia.
select lives_ok($$insert into public.materiales (tipo, titulo, documento_id) values ('archivo', 'Mi copia', public.registrar_documento(repeat('d', 64)))$$, 'dedup: beto sube el mismo archivo');
select is((select id from public.documentos where sha256 = repeat('d', 64)), (select id from documento_de_ana), 'dedup: usa la misma fila');

select pg_temp.como_postgres();
select * from finish();
rollback;
