-- Límites de registrar_documento: tope de texto y de archivo, cuota por usuario y que ningún error
-- revele si un hash ya está registrado.
begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

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

-- Texto de exactamente n bytes, sin espacios en las puntas.
create function pg_temp.texto(n int) returns text language sql as $$
  select left(repeat('ab ', n / 3 + 1), n - 1) || 'z'
$$;

create function pg_temp.hash(n int) returns text language sql as $$
  select lpad(to_hex(n), 64, '0')
$$;

create function pg_temp.uso(uid uuid) returns bigint language sql as $$
  select coalesce(sum(bytes), 0)::bigint from public.uso_documentos where user_id = uid
$$;

-- SQLSTATE y mensaje de lo que falla, para comparar dos respuestas enteras.
create function pg_temp.error(consulta text) returns text language plpgsql as $$
begin
  execute consulta;
  return 'sin error';
exception when others then
  return sqlstate || ': ' || sqlerrm;
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'ana@test.local'),
  ('00000000-0000-4000-8000-00000000000b', 'beto@test.local'),
  ('00000000-0000-4000-8000-00000000000c', 'cami@test.local'),
  ('00000000-0000-4000-8000-00000000000d', 'dani@test.local'),
  ('00000000-0000-4000-8000-00000000000e', 'eli@test.local'),
  ('00000000-0000-4000-8000-00000000000f', 'fede@test.local');

/* ---------- La tabla de límites ---------- */

select is((select max_bytes_texto from public.limites_documentos), 2097152::bigint, 'límites: 2 MB de texto por defecto');
select is((select cuota_bytes_por_usuario from public.limites_documentos), 52428800::bigint, 'límites: 50 MB de cuota por defecto');
select throws_ok($$insert into public.limites_documentos (max_bytes_texto, cuota_bytes_por_usuario) values (1, 1)$$, '23505', null, 'límites: una sola fila');
select throws_ok($$insert into public.limites_documentos (id, max_bytes_texto, cuota_bytes_por_usuario) values (false, 1, 1)$$, '23514', null, 'límites: tampoco con otra clave');

/* ---------- Tope de texto ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select lives_ok(format($$select public.registrar_documento(%L, null, null, null, pg_temp.texto(2097152))$$, pg_temp.hash(1)), 'texto: justo en el límite pasa');
select throws_ok(format($$select public.registrar_documento(%L, null, null, null, pg_temp.texto(2097153))$$, pg_temp.hash(2)), 'EQ001', 'el texto del documento supera el tamaño máximo permitido', 'texto: un byte arriba da EQ001');
select lives_ok(format($$select public.registrar_documento(%L, null, null, null, '   ' || pg_temp.texto(2097152) || '   ')$$, pg_temp.hash(3)), 'texto: se mide recortado');
select throws_ok(format($$select public.registrar_documento(%L, null, null, null, rtrim(repeat('ñ ', 699052)))$$, pg_temp.hash(4)), 'EQ001', null, 'texto: se mide en bytes, no en caracteres');

select pg_temp.como_postgres();
select is(pg_temp.uso('00000000-0000-4000-8000-00000000000a'), (2097152 + 1024) * 2::bigint, 'costo: bytes del texto recortado más 1 KB, sin cobrar lo rechazado');
select is((select count(*)::int from public.documentos where sha256 in (pg_temp.hash(2), pg_temp.hash(4))), 0, 'texto: lo rechazado no queda registrado');

/* ---------- Tope de archivo y de mime ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select lives_ok(format($$select public.registrar_documento(%L, 'application/pdf', 52428800)$$, pg_temp.hash(5)), 'archivo: justo en 50 MB pasa');
select throws_ok(format($$select public.registrar_documento(%L, 'application/pdf', 52428801)$$, pg_temp.hash(6)), 'EQ003', 'el archivo supera el tamaño máximo permitido', 'archivo: un byte arriba da EQ003');
select throws_ok(format($$select public.registrar_documento(%L, 'application/pdf', -1)$$, pg_temp.hash(6)), '23514', null, 'archivo: bytes negativos se rechazan');
select lives_ok(format($$select public.registrar_documento(%L, repeat('a', 255))$$, pg_temp.hash(7)), 'mime: justo en 255 caracteres pasa');
select throws_ok(format($$select public.registrar_documento(%L, repeat('a', 256))$$, pg_temp.hash(8)), 'EQ004', 'el tipo de archivo es demasiado largo', 'mime: uno más da EQ004');

/* ---------- Cuota: 10 KB para probarla sin mover megas ---------- */

select pg_temp.como_postgres();
update public.limites_documentos set max_bytes_texto = 8192, cuota_bytes_por_usuario = 10240;

select pg_temp.como('00000000-0000-4000-8000-00000000000c');
select lives_ok(format($$select public.registrar_documento(%L, null, null, null, pg_temp.texto(8192))$$, pg_temp.hash(10)), 'cuota: 9 KB entran');
select lives_ok(format($$select public.registrar_documento(%L)$$, pg_temp.hash(11)), 'cuota: un hash sin texto llega justo al límite');
select throws_ok(format($$select public.registrar_documento(%L)$$, pg_temp.hash(12)), 'EQ002', 'se superó la cuota de documentos del usuario', 'cuota: un hash sin texto de más da EQ002');

select pg_temp.como_postgres();
select is(pg_temp.uso('00000000-0000-4000-8000-00000000000c'), 10240::bigint, 'cuota: queda justo en el límite, sin cobrar lo rechazado');
select is((select count(*)::int from public.documentos where sha256 = pg_temp.hash(12)), 0, 'cuota: lo rechazado no queda registrado');

/* ---------- Sin doble cobro ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000c');
select is(public.registrar_documento(pg_temp.hash(10), null, null, null, pg_temp.texto(8192)), public.registrar_documento(pg_temp.hash(10), null, null, null, pg_temp.texto(8192)), 'reintento: con la cuota llena pasa y devuelve el mismo id');
select lives_ok(format($$select public.registrar_documento(%L)$$, pg_temp.hash(10)), 'reintento: sin texto tampoco cobra');
select throws_ok(format($$select public.registrar_documento(%L, null, null, null, pg_temp.texto(100))$$, pg_temp.hash(11)), 'EQ002', null, 'completar el texto de un hash pagado sin texto usa cuota: no se esquiva con 1 KB');

select pg_temp.como_postgres();
select is(pg_temp.uso('00000000-0000-4000-8000-00000000000c'), 10240::bigint, 'reintento: no cobró de nuevo');
select is((select texto from public.documentos where sha256 = pg_temp.hash(11)), null, 'cuota: lo rechazado no completó el texto');

select pg_temp.como('00000000-0000-4000-8000-00000000000d');
select public.registrar_documento(pg_temp.hash(20));
select pg_temp.como_postgres();
select is(pg_temp.uso('00000000-0000-4000-8000-00000000000d'), 1024::bigint, 'diferencia: el hash sin texto cuesta 1 KB');
select pg_temp.como('00000000-0000-4000-8000-00000000000d');
select public.registrar_documento(pg_temp.hash(20), null, null, null, pg_temp.texto(1000));
select pg_temp.como_postgres();
select is(pg_temp.uso('00000000-0000-4000-8000-00000000000d'), 2024::bigint, 'diferencia: con texto cobra solo lo que faltaba');
select pg_temp.como('00000000-0000-4000-8000-00000000000d');
select public.registrar_documento(pg_temp.hash(20), null, null, null, pg_temp.texto(10));
select pg_temp.como_postgres();
select is(pg_temp.uso('00000000-0000-4000-8000-00000000000d'), 2024::bigint, 'diferencia: un texto más corto no cobra ni devuelve');

/* ---------- La cuota es por usuario ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000e');
select lives_ok(format($$select public.registrar_documento(%L, null, null, null, pg_temp.texto(8192))$$, pg_temp.hash(30)), 'otro usuario: la cuota llena de cami no lo afecta');
select lives_ok(format($$select public.registrar_documento(%L)$$, pg_temp.hash(10)), 'otro usuario: registra un documento de cami, que ya está lleno');
select pg_temp.como_postgres();
select is(pg_temp.uso('00000000-0000-4000-8000-00000000000e'), 9216::bigint + 1024, 'otro usuario: paga lo suyo, aunque el documento ya existiera');
select is(pg_temp.uso('00000000-0000-4000-8000-00000000000c'), 10240::bigint, 'otro usuario: a cami no le cambia nada');

/* ---------- La respuesta no revela si el hash existe ---------- */

-- eli está sin cuota. hash(10) existe, con texto; hash(40) no existe.
select pg_temp.como('00000000-0000-4000-8000-00000000000e');
select is(pg_temp.error(format($$select public.registrar_documento(%L)$$, pg_temp.hash(41))), 'EQ002: se superó la cuota de documentos del usuario', 'misma respuesta: sin cuota y el hash no existe');
select is(pg_temp.error(format($$select public.registrar_documento(%L)$$, pg_temp.hash(1))), 'EQ002: se superó la cuota de documentos del usuario', 'misma respuesta: sin cuota y el hash existe');
select is(pg_temp.error(format($$select public.registrar_documento(%L, null, null, null, pg_temp.texto(8193))$$, pg_temp.hash(41))), pg_temp.error(format($$select public.registrar_documento(%L, null, null, null, pg_temp.texto(8193))$$, pg_temp.hash(1))), 'misma respuesta: texto de más');
select is(pg_temp.error(format($$select public.registrar_documento(%L, null, 52428801)$$, pg_temp.hash(41))), pg_temp.error(format($$select public.registrar_documento(%L, null, 52428801)$$, pg_temp.hash(1))), 'misma respuesta: archivo de más');
select is(pg_temp.error(format($$select public.registrar_documento(%L, repeat('a', 256))$$, pg_temp.hash(41))), pg_temp.error(format($$select public.registrar_documento(%L, repeat('a', 256))$$, pg_temp.hash(1))), 'misma respuesta: mime de más');

-- fede registra uno que existe y otro que no, con el mismo texto: paga lo mismo por cada uno.
select pg_temp.como('00000000-0000-4000-8000-00000000000f');
select public.registrar_documento(pg_temp.hash(1), null, null, null, pg_temp.texto(100));
select pg_temp.como_postgres();
select is(pg_temp.uso('00000000-0000-4000-8000-00000000000f'), 1124::bigint, 'mismo cobro: por un documento que ya existía');
select pg_temp.como('00000000-0000-4000-8000-00000000000f');
select public.registrar_documento(pg_temp.hash(42), null, null, null, pg_temp.texto(100));
select pg_temp.como_postgres();
select is(pg_temp.uso('00000000-0000-4000-8000-00000000000f'), 2248::bigint, 'mismo cobro: por un documento nuevo');

/* ---------- Texto dentro del tope que no entra en el tsvector ---------- */

update public.limites_documentos set max_bytes_texto = 2097152, cuota_bytes_por_usuario = 52428800;
-- El peor caso pedido: 2 MB de palabras todas distintas.
create function pg_temp.palabras_distintas() returns text language sql as $$
  select string_agg(md5(i::text), ' ') from generate_series(1, 63550) i
$$;
-- Peor todavía: cada palabra con guion da tres lexemas distintos.
create function pg_temp.palabras_con_guion() returns text language sql as $$
  select string_agg(substr(md5(i::text), 1, 4) || '-' || substr(md5(i::text), 5, 4), ' ') from generate_series(1, 209700) i
$$;
select ok(octet_length(pg_temp.palabras_distintas()) between 2090000 and 2097152, 'tsvector: el peor caso llega casi a los 2 MB');
select ok(octet_length(pg_temp.palabras_con_guion()) between 2090000 and 2097152, 'tsvector: el caso con guiones también');

select pg_temp.como('00000000-0000-4000-8000-00000000000f');
select lives_ok(format($$select public.registrar_documento(%L, null, null, null, pg_temp.palabras_distintas())$$, pg_temp.hash(43)), 'tsvector: 2 MB de palabras distintas se registran sin error');
select lives_ok(format($$select public.registrar_documento(%L, null, null, null, pg_temp.palabras_distintas())$$, pg_temp.hash(1)), 'tsvector: y también sobre un documento que ya existía');
select lives_ok(format($$select public.registrar_documento(%L, null, null, null, pg_temp.palabras_con_guion())$$, pg_temp.hash(44)), 'tsvector: 2 MB de palabras con guion también');
select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select lives_ok(format($$select public.registrar_documento(%L, null, null, null, pg_temp.texto(2097000) || ' ultima')$$, pg_temp.hash(45)), 'tsvector: un texto común de 2 MB');

select pg_temp.como_postgres();
select is((select octet_length(texto) from public.documentos where sha256 = pg_temp.hash(43)), octet_length(pg_temp.palabras_distintas()), 'tsvector: el texto se guarda entero');
select ok((select texto_tsv @@ plainto_tsquery('spanish', md5('1')) from public.documentos where sha256 = pg_temp.hash(43)), 'tsvector: el principio del texto se puede buscar');
select ok(not (select texto_tsv @@ plainto_tsquery('spanish', md5('63550')) from public.documentos where sha256 = pg_temp.hash(43)), 'tsvector: el final queda afuera del índice');
select ok((select texto_tsv @@ plainto_tsquery('spanish', substr(md5('1'), 1, 4)) from public.documentos where sha256 = pg_temp.hash(44)), 'tsvector: con guiones, el principio también se puede buscar');
select ok((select texto_tsv @@ to_tsquery('spanish', 'ultima') from public.documentos where sha256 = pg_temp.hash(45)), 'tsvector: en un texto común se puede buscar hasta el final');
select is(public.documento_texto_tsv(''), ''::tsvector, 'tsvector: un texto vacío da un tsvector vacío');

/* ---------- Cambiar los límites cambia el resultado, sin tocar código ---------- */

update public.limites_documentos set max_bytes_texto = 100;
select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select throws_ok(format($$select public.registrar_documento(%L, null, null, null, pg_temp.texto(101))$$, pg_temp.hash(50)), 'EQ001', null, 'límites: un tope de texto más bajo rechaza lo que antes pasaba');
select pg_temp.como_postgres();
update public.limites_documentos set max_bytes_texto = 200;
select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select lives_ok(format($$select public.registrar_documento(%L, null, null, null, pg_temp.texto(101))$$, pg_temp.hash(50)), 'límites: subirlo lo acepta');

select pg_temp.como_postgres();
update public.limites_documentos set cuota_bytes_por_usuario = 1024;
select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select throws_ok(format($$select public.registrar_documento(%L)$$, pg_temp.hash(51)), 'EQ002', null, 'límites: una cuota más baja frena');
select pg_temp.como_postgres();
update public.limites_documentos set cuota_bytes_por_usuario = 52428800;
select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select lives_ok(format($$select public.registrar_documento(%L)$$, pg_temp.hash(51)), 'límites: subirla lo acepta');

/* ---------- Bloqueo, sesión y borrado del usuario ---------- */

select ok(exists (
  select 1
  from pg_locks l, (select hashtextextended('uso_documentos:00000000-0000-4000-8000-00000000000b', 0) as clave) k
  where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.mode = 'ExclusiveLock' and l.objsubid = 1
    and l.classid = ((k.clave >> 32) & 4294967295)::oid
    and l.objid = (k.clave & 4294967295)::oid
), 'carreras: toma el advisory lock de este usuario');

select pg_temp.como_postgres();
select set_config('request.jwt.claims', '', true);
set local role authenticated;
select throws_ok(format($$select public.registrar_documento(%L)$$, pg_temp.hash(60)), '42501', 'hace falta una sesión', 'sin sesión no registra');

select pg_temp.como_postgres();
delete from auth.users where id = '00000000-0000-4000-8000-00000000000c';
select is(pg_temp.uso('00000000-0000-4000-8000-00000000000c'), 0::bigint, 'usuario borrado: se borra su uso');
select is((select count(*)::int from public.documentos where sha256 = pg_temp.hash(10)), 1, 'usuario borrado: el documento sigue');

select * from finish();
rollback;
