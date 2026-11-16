-- Acento y modo en el perfil: valores válidos, cada uno solo el suyo y sin abrir otras columnas.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

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

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'ana@test.local'),
  ('00000000-0000-4000-8000-00000000000b', 'beto@test.local');

select is(
  (select acento || '/' || coalesce(tema, '-') from public.perfiles where id = '00000000-0000-4000-8000-00000000000a'),
  null, 'un perfil nuevo no tiene acento ni modo guardados');

/* ---------- El propio ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select lives_ok(
  $$update public.perfiles set acento = 'naranja', tema = 'light' where id = '00000000-0000-4000-8000-00000000000a'$$,
  'el alumno guarda su acento y su modo');
select is(
  (select acento || '/' || tema from public.perfiles where id = '00000000-0000-4000-8000-00000000000a'),
  'naranja/light', 'quedan guardados');
select lives_ok(
  $$update public.perfiles set acento = null, tema = null where id = '00000000-0000-4000-8000-00000000000a'$$,
  'puede volver a dejarlos vacíos');

select throws_ok(
  $$update public.perfiles set acento = 'fucsia' where id = '00000000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'un acento que no existe se rechaza');
select throws_ok(
  $$update public.perfiles set acento = 'Azul' where id = '00000000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'el acento distingue mayúsculas');
select throws_ok(
  $$update public.perfiles set tema = 'sepia' where id = '00000000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'un modo que no existe se rechaza');
select throws_ok(
  $$update public.perfiles set es_admin = true where id = '00000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'es_admin sigue cerrada');

/* ---------- El de otro ---------- */

-- La RLS no da error: el update no encuentra la fila. Se mira después, como postgres.
select lives_ok(
  $$update public.perfiles set acento = 'verde', tema = 'dark' where id = '00000000-0000-4000-8000-00000000000b'$$,
  'el update sobre el perfil de otro no falla, pero no encuentra la fila');
select pg_temp.como_postgres();
select is(
  (select acento from public.perfiles where id = '00000000-0000-4000-8000-00000000000b'),
  null, 'el perfil de otro queda igual');

/* ---------- anon ---------- */

select pg_temp.como_anon();
select throws_ok(
  $$update public.perfiles set acento = 'verde'$$, '42501', null, 'anon no cambia ningún perfil');
select throws_ok(
  $$select acento from public.perfiles$$, '42501', null, 'anon no lee preferencias');
select pg_temp.como_postgres();

/* ---------- Los permisos por columna ---------- */

select is(
  (select array_agg(a.attname::text order by a.attname::text collate "C")
   from pg_attribute a
   where a.attrelid = 'public.perfiles'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')),
  array['acento', 'avatar_url', 'nombre', 'tema'],
  'de perfiles, authenticated actualiza solo nombre, avatar_url, acento y tema');
select is(
  (select count(*)::int
   from pg_attribute a
   where a.attrelid = 'public.perfiles'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT')),
  0, 'authenticated sigue sin insertar perfiles');

select * from finish();
rollback;
