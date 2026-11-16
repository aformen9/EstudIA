-- Trigger de perfil, grants por columna y políticas de perfiles.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

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

/* ---------- Trigger de perfil ---------- */

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', 'ana@test.local', '{"full_name": "Ana Pérez", "avatar_url": "https://img.test/ana.png"}'),
  ('00000000-0000-4000-8000-00000000000b', 'beto@test.local', '{"name": "Beto", "picture": "https://img.test/beto.png"}'),
  ('00000000-0000-4000-8000-00000000000c', 'cami@test.local', '{}'),
  ('00000000-0000-4000-8000-00000000000d', 'dani@test.local', null),
  ('00000000-0000-4000-8000-00000000000e', 'eli@test.local', '{"full_name": "  ", "avatar_url": ""}'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.local', '{}');

select is((select nombre from public.perfiles where id = '00000000-0000-4000-8000-00000000000a'), 'Ana Pérez', 'perfil: nombre de full_name');
select is((select avatar_url from public.perfiles where id = '00000000-0000-4000-8000-00000000000a'), 'https://img.test/ana.png', 'perfil: avatar de avatar_url');
select is((select nombre from public.perfiles where id = '00000000-0000-4000-8000-00000000000b'), 'Beto', 'perfil: nombre de name');
select is((select avatar_url from public.perfiles where id = '00000000-0000-4000-8000-00000000000b'), 'https://img.test/beto.png', 'perfil: avatar de picture');
select is((select nombre from public.perfiles where id = '00000000-0000-4000-8000-00000000000c'), null, 'perfil: sin metadatos no falla');
select ok(exists (select 1 from public.perfiles where id = '00000000-0000-4000-8000-00000000000d'), 'perfil: con metadatos null se crea igual');
select is((select nombre from public.perfiles where id = '00000000-0000-4000-8000-00000000000e'), null, 'perfil: nombre en blanco queda null');
select is((select es_admin from public.perfiles where id = '00000000-0000-4000-8000-00000000000a'), false, 'perfil: es_admin arranca en false');

update public.perfiles set es_admin = true where id = '00000000-0000-4000-8000-0000000000ad';

/* ---------- Grants por columna ---------- */

select is(has_column_privilege('authenticated', 'public.perfiles', 'nombre', 'UPDATE'), true, 'grant: nombre editable');
select is(has_column_privilege('authenticated', 'public.perfiles', 'avatar_url', 'UPDATE'), true, 'grant: avatar_url editable');
select is(has_column_privilege('authenticated', 'public.perfiles', 'es_admin', 'UPDATE'), false, 'grant: es_admin no editable');
select is(has_column_privilege('authenticated', 'public.perfiles', 'id', 'UPDATE'), false, 'grant: id no editable');
select is(has_table_privilege('authenticated', 'public.perfiles', 'INSERT'), false, 'grant: sin insert');
select is(has_table_privilege('authenticated', 'public.perfiles', 'DELETE'), false, 'grant: sin delete');

/* ---------- Políticas ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is((select count(*)::int from public.perfiles), 1, 'perfiles select: el alumno solo ve uno');
select is((select id from public.perfiles), '00000000-0000-4000-8000-00000000000a'::uuid, 'perfiles select: y es el propio');
select is(pg_temp.filas($$update public.perfiles set nombre = 'Ana', avatar_url = 'https://img.test/nueva.png' where id = '00000000-0000-4000-8000-00000000000a'$$), 1, 'perfiles update: edita su nombre y avatar');
select is(pg_temp.filas($$update public.perfiles set nombre = 'Hack' where id = '00000000-0000-4000-8000-00000000000b'$$), 0, 'perfiles update: no edita el de otro');
select throws_ok($$update public.perfiles set es_admin = true where id = '00000000-0000-4000-8000-00000000000a'$$, '42501', null, 'perfiles update: no puede ponerse es_admin');
select throws_ok($$update public.perfiles set id = '00000000-0000-4000-8000-00000000000b' where id = '00000000-0000-4000-8000-00000000000a'$$, '42501', null, 'perfiles update: no puede cambiar su id');
select throws_ok($$insert into public.perfiles (id, es_admin) values ('00000000-0000-4000-8000-00000000000a', true)$$, '42501', null, 'perfiles insert: prohibido');
select throws_ok($$delete from public.perfiles where id = '00000000-0000-4000-8000-00000000000a'$$, '42501', null, 'perfiles delete: prohibido');
select is(public.es_admin(), false, 'es_admin(): false para un alumno');

select pg_temp.como('00000000-0000-4000-8000-0000000000ad');
select is((select count(*)::int from public.perfiles where id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000ad')), 3, 'perfiles select: admin ve todos');
select is(public.es_admin(), true, 'es_admin(): true para un admin');
select is(pg_temp.filas($$update public.perfiles set nombre = 'Del admin' where id = '00000000-0000-4000-8000-00000000000a'$$), 0, 'perfiles update: admin tampoco edita el de otro');
select throws_ok($$update public.perfiles set es_admin = true where id = '00000000-0000-4000-8000-00000000000b'$$, '42501', null, 'perfiles update: admin tampoco nombra admins por la API');

select pg_temp.como_postgres();
select is((select es_admin from public.perfiles where id = '00000000-0000-4000-8000-00000000000a'), false, 'es_admin sigue en false');
select is((select nombre from public.perfiles where id = '00000000-0000-4000-8000-00000000000a'), 'Ana', 'el nombre quedó como lo editó ella');

select * from finish();
rollback;
