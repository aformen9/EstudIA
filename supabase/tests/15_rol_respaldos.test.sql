-- Rol `respaldos`: lee todo (también auth y lo que la RLS esconde) y no escribe nada.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select has_role('respaldos', 'existe el rol respaldos');
select is(
  (select row(rolcanlogin, rolbypassrls, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolconnlimit)::text
   from pg_roles where rolname = 'respaldos'),
  '(t,t,f,f,f,f,2)',
  'atributos: entra, se saltea la RLS, y nada más (límite de 2 conexiones)');
select is(
  (select array_agg(r.rolname::text order by r.rolname)
   from pg_auth_members m join pg_roles r on r.oid = m.roleid
   where m.member = 'respaldos'::regrole),
  array['pg_read_all_data'],
  'solo es miembro de pg_read_all_data (nunca de postgres)');
select ok(
  (select setconfig @> array['default_transaction_read_only=on']
   from pg_db_role_setting where setrole = 'respaldos'::regrole and setdatabase = 0),
  'sus sesiones arrancan en solo lectura');
select ok(
  not pg_has_role('respaldos', 'postgres', 'MEMBER') and not pg_has_role('respaldos', 'service_role', 'MEMBER'),
  'no puede volverse postgres ni service_role');
select is(
  (select count(*)::int from pg_auth_members where roleid = 'respaldos'::regrole and member <> 'postgres'::regrole),
  0,
  'nadie más es miembro de respaldos');

-- Datos conocidos, como postgres: un alumno con un reporte (la RLS no deja leer reportes a nadie).
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000e1', 'r@test.local');
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000e1', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.reportes (tipo, texto) values ('problema', 'x');
reset role;
select set_config('request.jwt.claims', '', true);

-- Para entrar como respaldos en el test (se deshace con el rollback).
grant respaldos to postgres;
set local role respaldos;

select ok((select count(*) from auth.users) > 0, 'lee auth.users');
select ok((select count(*) from auth.identities) >= 0, 'lee auth.identities');
select ok((select count(*) from public.perfiles) > 0, 'lee perfiles');
select ok(
  (select count(*) from public.reportes where user_id = '00000000-0000-4000-8000-0000000000e1') = 1,
  've filas que la RLS esconde (reportes)');
select ok((select count(*) from public.materias) >= 50, 'lee el catálogo');

select throws_ok($$insert into public.reportes (tipo, texto) values ('problema', 'y')$$, '42501', null, 'no inserta');
select throws_ok($$update public.perfiles set nombre = 'x'$$, '42501', null, 'no actualiza');
select throws_ok($$delete from public.materias$$, '42501', null, 'no borra');
select throws_ok($$delete from auth.users$$, '42501', null, 'no borra usuarios de Auth');
select throws_ok($$create table public.respaldos_prueba (id int)$$, '42501', null, 'no crea tablas');

select * from finish();
rollback;
