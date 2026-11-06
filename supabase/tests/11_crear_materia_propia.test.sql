-- crear_materia_propia: materia y correlativas en una transacción, idempotente con el id del cliente.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

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

create function pg_temp.lcd() returns uuid language sql as $$ select id from public.planes where version = '7023' $$;
create function pg_temp.materia(cod text) returns uuid language sql as $$
  select m.id from public.materias m join public.planes p on p.id = m.plan_id
  where p.version = '7023' and m.owner_id is null and m.codigo = cod
$$;
create function pg_temp.datos(nombre text, codigo text default null) returns jsonb language sql as $$
  select jsonb_build_object('codigo', codigo, 'nombre', nombre, 'anio', 2, 'cuatrimestre', 1, 'tipo', 'Seminario',
    'area', 'Libre', 'requiereAnioCompletoParaCursar', 2)
$$;
create function pg_temp.correlativa(requiere uuid, para text default 'cursar', condicion text default 'regular') returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('requiere', requiere, 'para', para, 'condicion', condicion))
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'ana@test.local'),
  ('00000000-0000-4000-8000-00000000000b', 'beto@test.local');

-- Plan pendiente de beto, con una materia del catálogo; otro plan publicado con su materia.
insert into public.planes (id, carrera_id, version, estado, creado_por)
select '30000000-0000-4000-8000-0000000000b1', c.id, 'PEND-BETO', 'pendiente', '00000000-0000-4000-8000-00000000000b'
from public.carreras c where c.sigla = 'LCD';
insert into public.planes (id, carrera_id, version, estado)
select '30000000-0000-4000-8000-000000000002', c.id, 'OTRO', 'publicado'
from public.carreras c where c.sigla = 'LCD';
insert into public.materias (id, plan_id, codigo, nombre, anio) values
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'OTRA', 'De otro plan', 1);
insert into public.materias (id, plan_id, nombre, anio, owner_id) values
  ('40000000-0000-4000-8000-0000000000b1', pg_temp.lcd(), 'Propia de beto', 1, '00000000-0000-4000-8000-00000000000b');

/* ---------- Creación ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
create temp table creada on commit drop as
  select * from public.crear_materia_propia(
    '40000000-0000-4000-8000-0000000000a1', pg_temp.lcd(), pg_temp.datos('Optativa', '  OPT1  '),
    pg_temp.correlativa(pg_temp.materia('GMA0136')) || pg_temp.correlativa(pg_temp.materia('GES0132'), 'rendir', 'aprobada'));
grant select on creada to authenticated;

select is((select id from creada), '40000000-0000-4000-8000-0000000000a1'::uuid, 'crear: devuelve la materia con el id del cliente');
select is((select owner_id from public.materias where id = '40000000-0000-4000-8000-0000000000a1'), auth.uid(), 'crear: el dueño es quien llama');
select is((select plan_id from public.materias where id = '40000000-0000-4000-8000-0000000000a1'), pg_temp.lcd(), 'crear: en el plan pedido');
select is((select codigo from creada), 'OPT1', 'crear: recorta el código');
select is((select nombre || '/' || anio || '/' || cuatrimestre || '/' || tipo || '/' || area || '/' || requiere_anio_completo_para_cursar from creada), 'Optativa/2/1/Seminario/Libre/2', 'crear: guarda los datos de la materia');
select is((select orden from creada), (select max(orden) from public.materias where plan_id = pg_temp.lcd()), 'crear: va al final del plan');
select ok((select orden from creada) > 50, 'crear: después del catálogo');
select is((select count(*)::int from public.correlativas where materia_id = '40000000-0000-4000-8000-0000000000a1'), 2, 'crear: guarda las correlativas');
select is((select condicion from public.correlativas where materia_id = '40000000-0000-4000-8000-0000000000a1' and para = 'rendir'), 'aprobada', 'crear: con su condición');

select lives_ok($$select public.crear_materia_propia('40000000-0000-4000-8000-0000000000a2', pg_temp.lcd(), jsonb_build_object('nombre', 'Mínima', 'anio', 1, 'codigo', '   '))$$, 'crear: sin correlativas ni datos opcionales');
select is((select tipo from public.materias where id = '40000000-0000-4000-8000-0000000000a2'), 'Materia', 'crear: tipo por defecto');
select is((select codigo from public.materias where id = '40000000-0000-4000-8000-0000000000a2'), null, 'crear: un código en blanco queda null');
select lives_ok($$select public.crear_materia_propia('40000000-0000-4000-8000-0000000000a3', pg_temp.lcd(), pg_temp.datos('Depende de una propia'), pg_temp.correlativa('40000000-0000-4000-8000-0000000000a1'))$$, 'crear: correlativa a otra materia propia');

/* ---------- Si algo falla no queda nada ---------- */

create function pg_temp.no_quedo(uid uuid) returns boolean language sql as $$
  select not exists (select 1 from public.materias where id = uid)
    and not exists (select 1 from public.correlativas where materia_id = uid)
$$;

select throws_ok($$select public.crear_materia_propia('40000000-0000-4000-8000-0000000000e1', pg_temp.lcd(), pg_temp.datos('X'), pg_temp.correlativa('40000000-0000-4000-8000-000000000099'))$$, '42501', null, 'correlativa a una materia que no existe: falla');
select ok(pg_temp.no_quedo('40000000-0000-4000-8000-0000000000e1'), 'correlativa a una materia que no existe: no queda nada');
select throws_ok($$select public.crear_materia_propia('40000000-0000-4000-8000-0000000000e2', pg_temp.lcd(), pg_temp.datos('X'), pg_temp.correlativa('40000000-0000-4000-8000-0000000000b1'))$$, '42501', null, 'correlativa a la propia de otro: falla');
select ok(pg_temp.no_quedo('40000000-0000-4000-8000-0000000000e2'), 'correlativa a la propia de otro: no queda nada');
select throws_ok($$select public.crear_materia_propia('40000000-0000-4000-8000-0000000000e3', pg_temp.lcd(), pg_temp.datos('X'), pg_temp.correlativa('40000000-0000-4000-8000-000000000002'))$$, '42501', null, 'correlativa a otro plan: falla');
select ok(pg_temp.no_quedo('40000000-0000-4000-8000-0000000000e3'), 'correlativa a otro plan: no queda nada');
select throws_ok($$select public.crear_materia_propia('40000000-0000-4000-8000-0000000000e4', pg_temp.lcd(), pg_temp.datos('X'), pg_temp.correlativa(pg_temp.materia('GMA0136')) || pg_temp.correlativa(pg_temp.materia('GES0132'), 'otra'))$$, '23514', null, 'una correlativa inválida entre varias: falla');
select ok(pg_temp.no_quedo('40000000-0000-4000-8000-0000000000e4'), 'una correlativa inválida entre varias: no queda nada');
select throws_ok($$select public.crear_materia_propia('40000000-0000-4000-8000-0000000000e5', pg_temp.lcd(), pg_temp.datos('X'), pg_temp.correlativa('40000000-0000-4000-8000-0000000000e5'))$$, '23514', null, 'correlativa a sí misma: falla');
select ok(pg_temp.no_quedo('40000000-0000-4000-8000-0000000000e5'), 'correlativa a sí misma: no queda nada');
select throws_ok($$select public.crear_materia_propia('40000000-0000-4000-8000-0000000000e6', pg_temp.lcd(), pg_temp.datos('X'), '{}')$$, '22023', null, 'correlativas que no son una lista: falla');
select throws_ok($$select public.crear_materia_propia('40000000-0000-4000-8000-0000000000e6', pg_temp.lcd(), '{"anio": 1}')$$, '23502', null, 'materia sin nombre: falla');
select ok(pg_temp.no_quedo('40000000-0000-4000-8000-0000000000e6'), 'datos inválidos: no queda nada');

/* ---------- Reintento con el mismo id ---------- */

select is((select nombre from public.crear_materia_propia('40000000-0000-4000-8000-0000000000a1', pg_temp.lcd(), pg_temp.datos('Pisada', 'OTRO'), '[]')), 'Optativa', 'reintento: devuelve la existente');
select is((select count(*)::int from public.materias where id = '40000000-0000-4000-8000-0000000000a1'), 1, 'reintento: una sola fila');
select is((select nombre from public.materias where id = '40000000-0000-4000-8000-0000000000a1'), 'Optativa', 'reintento: no pisa la materia');
select is((select count(*)::int from public.correlativas where materia_id = '40000000-0000-4000-8000-0000000000a1'), 2, 'reintento: no borra las correlativas');
select is((select (r).nombre from (select public.crear_materia_propia('40000000-0000-4000-8000-0000000000a1', pg_temp.lcd(), pg_temp.datos('Optativa'), pg_temp.correlativa(pg_temp.materia('GCC0000'))) as r) x), 'Optativa', 'reintento: tampoco mira las correlativas nuevas');
select is((select count(*)::int from public.correlativas where materia_id = '40000000-0000-4000-8000-0000000000a1'), 2, 'reintento: ni las agrega');
select is((select plan_id from public.crear_materia_propia('40000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000002', pg_temp.datos('X'))), pg_temp.lcd(), 'reintento: con otro plan visible devuelve la existente en su plan');

/* ---------- id ajeno ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select throws_ok($$select public.crear_materia_propia('40000000-0000-4000-8000-0000000000a1', pg_temp.lcd(), pg_temp.datos('Pisada por beto'))$$, '42501', 'no se pudo crear la materia con ese id', 'id ajeno: falla sin revelar nada de la materia');
select throws_ok(format($$select public.crear_materia_propia(%L, pg_temp.lcd(), pg_temp.datos('Pisada por beto'))$$, pg_temp.materia('GMA0136')), '42501', 'no se pudo crear la materia con ese id', 'id de una materia del catálogo: falla igual');
select is((select count(*)::int from public.materias where id = '40000000-0000-4000-8000-0000000000a1'), 0, 'id ajeno: beto sigue sin verla');

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select is((select nombre from public.materias where id = '40000000-0000-4000-8000-0000000000a1'), 'Optativa', 'id ajeno: la fila de ana sigue igual');
select is((select owner_id from public.materias where id = '40000000-0000-4000-8000-0000000000a1'), auth.uid(), 'id ajeno: y sigue siendo suya');

/* ---------- Plan no visible y sesión ---------- */

select throws_ok($$select public.crear_materia_propia('40000000-0000-4000-8000-0000000000e7', '30000000-0000-4000-8000-0000000000b1', pg_temp.datos('X'))$$, '42501', null, 'plan no visible: falla');
select throws_ok($$select public.crear_materia_propia('40000000-0000-4000-8000-0000000000e7', '30000000-0000-4000-8000-0000000000ff', pg_temp.datos('X'))$$, '42501', null, 'plan inexistente: falla igual');
select ok(pg_temp.no_quedo('40000000-0000-4000-8000-0000000000e7'), 'plan no visible: no queda nada');

select pg_temp.como_postgres();
select ok(not has_function_privilege('anon', 'public.crear_materia_propia(uuid, uuid, jsonb, jsonb)', 'EXECUTE'), 'anon no ejecuta crear_materia_propia');
select ok(has_function_privilege('authenticated', 'public.crear_materia_propia(uuid, uuid, jsonb, jsonb)', 'EXECUTE'), 'authenticated sí');
select ok(not (select prosecdef from pg_proc where oid = 'public.crear_materia_propia'::regproc), 'es security invoker: la RLS aplica sola');

select set_config('request.jwt.claims', '', true);
set local role authenticated;
select throws_ok($$select public.crear_materia_propia(gen_random_uuid(), pg_temp.lcd(), pg_temp.datos('X'))$$, '42501', 'hace falta una sesión', 'sin sesión falla');
select pg_temp.como_postgres();

set local role anon;
select throws_ok($$select public.crear_materia_propia(gen_random_uuid(), gen_random_uuid(), '{}')$$, '42501', null, 'anon: permiso denegado al llamarla');
reset role;

select * from finish();
rollback;
