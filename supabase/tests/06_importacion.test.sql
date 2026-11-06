-- reemplazar_datos_del_plan: forma de DatosImportados, reutilización de materias propias y todo o nada.
begin;
create extension if not exists pgtap with schema extensions;
select plan(85);

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

-- Un archivo con dos materias propias (con y sin código) que se referencian entre sí y al catálogo.
create function pg_temp.archivo() returns jsonb language sql as $$
  select jsonb_build_object(
    'materiasPropias', jsonb_build_array(
      jsonb_build_object('clave', 'OPT1', 'codigo', 'OPT1', 'nombre', 'Optativa uno', 'anio', 3, 'cuatrimestre', 1,
        'tipo', 'Materia', 'area', 'Libre', 'requiereAnioCompletoParaCursar', 2,
        'correlativas', jsonb_build_array(
          jsonb_build_object('requiere', pg_temp.materia('GMA0136'), 'para', 'cursar', 'condicion', 'regular'),
          jsonb_build_object('requiere', 'sin-codigo', 'para', 'rendir', 'condicion', 'aprobada'))),
      jsonb_build_object('clave', 'sin-codigo', 'codigo', null, 'nombre', 'Taller', 'anio', 0, 'cuatrimestre', null,
        'tipo', 'Seminario', 'area', null, 'requiereAnioCompletoParaCursar', null,
        'correlativas', '[]'::jsonb)),
    'progreso', jsonb_build_array(
      jsonb_build_object('materiaId', pg_temp.materia('GMA0136'), 'estado', 'aprobada', 'p1', 7, 'p2', 8, 'rec', null,
        'notaCursada', 7.5, 'notaFinalExamen', 9, 'nota', 9, 'aplazos', jsonb_build_array(2, 3)),
      jsonb_build_object('materiaId', 'OPT1', 'estado', 'cursando', 'p1', null, 'p2', null, 'rec', null,
        'notaCursada', null, 'notaFinalExamen', null, 'nota', null, 'aplazos', '[]'::jsonb)),
    'historial', jsonb_build_array(
      jsonb_build_object('materiaId', pg_temp.materia('GMA0136'), 'fecha', '2025-07-10', 'tipo', 'Examen', 'nota', 2, 'resultado', 'Reprobado', 'fuente', 'siu'),
      jsonb_build_object('materiaId', 'sin-codigo', 'fecha', '2025-12-01', 'tipo', 'Promocion', 'nota', 8, 'resultado', 'Promocionado', 'fuente', 'manual')));
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'ana@test.local'),
  ('00000000-0000-4000-8000-00000000000b', 'beto@test.local'),
  ('00000000-0000-4000-8000-00000000000c', 'cami@test.local');

-- Otro plan, para verificar que no se toca y que no se aceptan materias de otro plan.
insert into public.universidades (id, nombre, estado) values ('10000000-0000-4000-8000-000000000001', 'Otra uni', 'publicado');
insert into public.carreras (id, universidad_id, nombre, estado) values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Otra carrera', 'publicado');
insert into public.planes (id, carrera_id, version, estado) values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'OTRO', 'publicado');
insert into public.planes (id, carrera_id, version, estado, creado_por) values ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'PEND', 'pendiente', '00000000-0000-4000-8000-00000000000b');
insert into public.materias (id, plan_id, codigo, nombre, anio) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'OTRA1', 'Materia de otra carrera', 1);
insert into public.materias (id, plan_id, nombre, anio, owner_id) values
  ('40000000-0000-4000-8000-0000000000b1', pg_temp.lcd(), 'Propia de beto', 1, '00000000-0000-4000-8000-00000000000b');

insert into public.inscripciones (user_id, plan_id, activa) values
  ('00000000-0000-4000-8000-00000000000a', pg_temp.lcd(), true),
  ('00000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000001', false),
  ('00000000-0000-4000-8000-00000000000b', pg_temp.lcd(), true);

-- Datos previos de ana: uno en LCD a reemplazar, una propia que no viene en el archivo y otro plan.
insert into public.materias (id, plan_id, nombre, anio, owner_id) values
  ('40000000-0000-4000-8000-0000000000a9', pg_temp.lcd(), 'Propia que no viene', 1, '00000000-0000-4000-8000-00000000000a');
insert into public.progreso (user_id, materia_id, estado) values
  ('00000000-0000-4000-8000-00000000000a', pg_temp.materia('GES0132'), 'cursando'),
  ('00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-0000000000a9', 'final'),
  ('00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000001', 'cursando'),
  ('00000000-0000-4000-8000-00000000000b', pg_temp.materia('GES0132'), 'cursando');
insert into public.historial (user_id, materia_id, fecha, tipo, resultado) values
  ('00000000-0000-4000-8000-00000000000a', pg_temp.materia('GES0132'), '2024-01-01', 'En curso', 'En curso'),
  ('00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-0000000000a9', '2024-01-02', 'En curso', 'En curso'),
  ('00000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000001', '2024-01-03', 'En curso', 'En curso'),
  ('00000000-0000-4000-8000-00000000000b', pg_temp.materia('GES0132'), '2024-01-04', 'En curso', 'En curso');

/* ---------- Importación correcta ---------- */

select pg_temp.como('00000000-0000-4000-8000-00000000000a');
select lives_ok($$select public.reemplazar_datos_del_plan(pg_temp.lcd(), pg_temp.archivo())$$, 'importar: aplica el archivo');

select is((select count(*)::int from public.materias where owner_id = auth.uid() and plan_id = pg_temp.lcd()), 3, 'importar: crea las dos materias propias y conserva la que no vino');
select ok(exists (select 1 from public.materias where id = '40000000-0000-4000-8000-0000000000a9'), 'importar: conserva la materia propia que no vino');
select is((select requiere_anio_completo_para_cursar from public.materias where codigo = 'OPT1' and owner_id = auth.uid()), 2, 'importar: traduce requiereAnioCompletoParaCursar');
select is((select tipo from public.materias where nombre = 'Taller' and owner_id = auth.uid()), 'Seminario', 'importar: materia propia sin código');
select is((select codigo from public.materias where nombre = 'Taller' and owner_id = auth.uid()), null, 'importar: el código queda null');
select ok((select orden from public.materias where codigo = 'OPT1' and owner_id = auth.uid()) > 50, 'importar: las propias van después del catálogo');

select is((select count(*)::int from public.correlativas c join public.materias m on m.id = c.materia_id where m.codigo = 'OPT1' and m.owner_id = auth.uid()), 2, 'importar: crea las correlativas');
select is((select r.nombre from public.correlativas c join public.materias m on m.id = c.materia_id join public.materias r on r.id = c.requiere_id where m.codigo = 'OPT1' and m.owner_id = auth.uid() and c.para = 'rendir'), 'Taller', 'importar: resuelve la clave de una correlativa a su uuid');
select is((select c.requiere_id from public.correlativas c join public.materias m on m.id = c.materia_id where m.codigo = 'OPT1' and m.owner_id = auth.uid() and c.para = 'cursar'), pg_temp.materia('GMA0136'), 'importar: acepta el uuid del catálogo en una correlativa');

select is((select count(*)::int from public.progreso p join public.materias m on m.id = p.materia_id where m.plan_id = pg_temp.lcd()), 2, 'importar: progreso del plan reemplazado');
select is((select count(*)::int from public.progreso where materia_id = pg_temp.materia('GES0132')), 0, 'importar: borra el progreso que no venía');
select is((select count(*)::int from public.progreso where materia_id = '40000000-0000-4000-8000-0000000000a9'), 0, 'importar: borra el progreso de la materia propia que no vino');
select is((select estado from public.progreso where materia_id = '40000000-0000-4000-8000-000000000001'), 'cursando', 'importar: no toca el progreso de otro plan');
select is((select nota_cursada from public.progreso where materia_id = pg_temp.materia('GMA0136')), 7.5, 'importar: traduce notaCursada');
select is((select nota_final_examen from public.progreso where materia_id = pg_temp.materia('GMA0136')), 9::numeric, 'importar: traduce notaFinalExamen');
select is((select aplazos from public.progreso where materia_id = pg_temp.materia('GMA0136')), '{2,3}'::numeric[], 'importar: conserva aplazos en orden');
select is((select estado from public.progreso p join public.materias m on m.id = p.materia_id where m.codigo = 'OPT1' and m.owner_id = auth.uid()), 'cursando', 'importar: resuelve la clave en progreso');

select is((select count(*)::int from public.historial h join public.materias m on m.id = h.materia_id where m.plan_id = pg_temp.lcd()), 2, 'importar: historial del plan reemplazado');
select is((select count(*)::int from public.historial where materia_id = '40000000-0000-4000-8000-000000000001'), 1, 'importar: no toca el historial de otro plan');
select is((select fuente from public.historial where materia_id = pg_temp.materia('GMA0136')), 'siu', 'importar: conserva la fuente');
select is((select h.resultado from public.historial h join public.materias m on m.id = h.materia_id where m.nombre = 'Taller' and m.owner_id = auth.uid()), 'Promocionado', 'importar: resuelve la clave en historial');

/* ---------- Reimportar no duplica ---------- */

create temp table ids_antes on commit drop as
  select id from public.materias where owner_id = auth.uid() and plan_id = pg_temp.lcd();
grant select on ids_antes to authenticated;

select lives_ok($$select public.reemplazar_datos_del_plan(pg_temp.lcd(), pg_temp.archivo())$$, 'reimportar: aplica de nuevo');
select is((select count(*)::int from public.materias where owner_id = auth.uid() and plan_id = pg_temp.lcd()), 3, 'reimportar: no duplica materias propias');
select is((select count(*)::int from public.materias where owner_id = auth.uid() and plan_id = pg_temp.lcd() and id not in (select id from ids_antes)), 0, 'reimportar: reutiliza los mismos uuid');
select is((select count(*)::int from public.correlativas c join public.materias m on m.id = c.materia_id where m.codigo = 'OPT1' and m.owner_id = auth.uid()), 2, 'reimportar: no duplica correlativas');
select is((select count(*)::int from public.historial h join public.materias m on m.id = h.materia_id where m.plan_id = pg_temp.lcd()), 2, 'reimportar: no duplica historial');

/* ---------- Devuelve { clave: uuid } de las materias propias ---------- */

create temp table correspondencia on commit drop as
  select public.reemplazar_datos_del_plan(pg_temp.lcd(), pg_temp.archivo()) as mapa;
grant select on correspondencia to authenticated;

select is((select mapa ->> 'OPT1' from correspondencia), (select id::text from public.materias where codigo = 'OPT1' and owner_id = auth.uid()), 'devuelve el uuid de una materia propia con código');
select is((select mapa ->> 'sin-codigo' from correspondencia), (select id::text from public.materias where nombre = 'Taller' and owner_id = auth.uid()), 'devuelve el uuid de una materia propia sin código');
select is((select count(*)::int from correspondencia, jsonb_object_keys(mapa)), 2, 'devuelve solo las claves de las materias propias, no los uuid del catálogo');

select lives_ok($$select public.reemplazar_datos_del_plan(pg_temp.lcd(), jsonb_set(pg_temp.archivo(), '{materiasPropias,0,nombre}', '"Nombre nuevo"'))$$, 'reimportar: con otro nombre y el mismo código');
select is((select count(*)::int from public.materias where owner_id = auth.uid() and plan_id = pg_temp.lcd()), 3, 'reimportar: coincide por código aunque cambie el nombre');
select is((select nombre from public.materias where codigo = 'OPT1' and owner_id = auth.uid()), 'Nombre nuevo', 'reimportar: el archivo manda sobre la materia reutilizada');

select lives_ok($$select public.reemplazar_datos_del_plan(pg_temp.lcd(), jsonb_set(pg_temp.archivo(), '{materiasPropias,1,nombre}', '"Otro taller"'))$$, 'reimportar: sin código y con otro nombre');
select is((select count(*)::int from public.materias where owner_id = auth.uid() and plan_id = pg_temp.lcd()), 4, 'reimportar: sin código, otro nombre es otra materia');

/* ---------- Todo o nada ---------- */

create temp table estado_antes on commit drop as
  select
    (select count(*) from public.materias where owner_id = auth.uid()) as materias,
    (select count(*) from public.progreso) as progreso,
    (select count(*) from public.historial) as historial,
    (select nota from public.progreso where materia_id = pg_temp.materia('GMA0136')) as nota;
grant select on estado_antes to authenticated;

create function pg_temp.sin_cambios() returns boolean language sql as $$
  select
    (select count(*) from public.materias where owner_id = auth.uid()) = (select materias from estado_antes)
    and (select count(*) from public.progreso) = (select progreso from estado_antes)
    and (select count(*) from public.historial) = (select historial from estado_antes)
    and (select nota from public.progreso where materia_id = pg_temp.materia('GMA0136')) is not distinct from (select nota from estado_antes)
    and not exists (select 1 from public.materias where nombre = 'No debe quedar' and owner_id = auth.uid());
$$;

create function pg_temp.con_materia_nueva() returns jsonb language sql as $$
  select jsonb_set(pg_temp.archivo(), '{materiasPropias}',
    (pg_temp.archivo() -> 'materiasPropias') || jsonb_build_object('clave', 'NUEVA', 'codigo', 'NUEVA', 'nombre', 'No debe quedar',
      'anio', 1, 'cuatrimestre', 1, 'tipo', 'Materia', 'area', null, 'requiereAnioCompletoParaCursar', null, 'correlativas', '[]'::jsonb));
$$;

select throws_ok($$select public.reemplazar_datos_del_plan(pg_temp.lcd(), jsonb_set(pg_temp.con_materia_nueva(), '{historial,1,tipo}', '"Inventado"'))$$, '23514', null, 'todo o nada: falla la última fila del historial');
select ok(pg_temp.sin_cambios(), 'todo o nada: nada cambió tras fallar el historial');
select throws_ok($$select public.reemplazar_datos_del_plan(pg_temp.lcd(), jsonb_set(pg_temp.con_materia_nueva(), '{progreso,1,estado}', '"inventado"'))$$, '23514', null, 'todo o nada: falla el progreso');
select ok(pg_temp.sin_cambios(), 'todo o nada: nada cambió tras fallar el progreso');
select throws_ok($$select public.reemplazar_datos_del_plan(pg_temp.lcd(), jsonb_set(pg_temp.con_materia_nueva(), '{progreso,0,materiaId}', '"NO-EXISTE"'))$$, '22023', null, 'referencia a una clave inexistente');
select ok(pg_temp.sin_cambios(), 'todo o nada: nada cambió tras una referencia inválida');
select throws_ok($$select public.reemplazar_datos_del_plan(pg_temp.lcd(), jsonb_set(pg_temp.con_materia_nueva(), '{progreso,0,materiaId}', '"40000000-0000-4000-8000-000000000001"'))$$, '22023', null, 'una materia de otro plan se rechaza');
select ok(pg_temp.sin_cambios(), 'todo o nada: nada cambió tras una materia de otro plan');
select throws_ok($$select public.reemplazar_datos_del_plan(pg_temp.lcd(), jsonb_set(pg_temp.con_materia_nueva(), '{progreso,0,materiaId}', '"40000000-0000-4000-8000-0000000000b1"'))$$, '22023', null, 'la materia propia de otro alumno cuenta como inexistente');
select ok(pg_temp.sin_cambios(), 'todo o nada: nada cambió tras una materia propia ajena');
select throws_ok($$select public.reemplazar_datos_del_plan(pg_temp.lcd(), jsonb_set(pg_temp.archivo(), '{materiasPropias,1,clave}', '"OPT1"'))$$, '22023', null, 'una clave repetida se rechaza');
select ok(pg_temp.sin_cambios(), 'todo o nada: nada cambió tras una clave repetida');

/* ---------- Forma y permisos ---------- */

select throws_ok($$select public.reemplazar_datos_del_plan(pg_temp.lcd(), '{"progreso": [], "historial": []}')$$, '22023', null, 'faltan materiasPropias');
select throws_ok($$select public.reemplazar_datos_del_plan(pg_temp.lcd(), '{"materiasPropias": [], "progreso": {}, "historial": []}')$$, '22023', null, 'progreso no es una lista');
select throws_ok($$select public.reemplazar_datos_del_plan('30000000-0000-4000-8000-000000000002', '{"materiasPropias": [], "progreso": [], "historial": []}')$$, '42501', null, 'no sobre un plan que no puede ver');

-- Un archivo vacío deja el plan sin progreso, solo para quien lo aplica.
select is(public.reemplazar_datos_del_plan(pg_temp.lcd(), '{"materiasPropias": [], "progreso": [], "historial": []}'), '{}'::jsonb, 'archivo vacío: se acepta y devuelve un objeto vacío');
select is((select count(*)::int from public.progreso p join public.materias m on m.id = p.materia_id where m.plan_id = pg_temp.lcd()), 0, 'archivo vacío: reemplaza por nada');
select is((select count(*)::int from public.progreso), 1, 'archivo vacío: el otro plan sigue');

select pg_temp.como('00000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.progreso), 1, 'otro alumno: su progreso sigue intacto');
select is((select count(*)::int from public.historial), 1, 'otro alumno: su historial sigue intacto');
select is((select count(*)::int from public.materias where owner_id = '00000000-0000-4000-8000-00000000000a'), 0, 'otro alumno: no ve las materias propias importadas');

-- Sin inscripción: la RLS de progreso rechaza y no queda nada.
select pg_temp.como('00000000-0000-4000-8000-00000000000c');
select throws_ok($$select public.reemplazar_datos_del_plan(pg_temp.lcd(), pg_temp.archivo())$$, '42501', null, 'sin inscripción no importa materias del catálogo');
select is((select count(*)::int from public.materias where owner_id = auth.uid()), 0, 'sin inscripción: tampoco quedan las materias propias');

/* ---------- Una materia existente se reutiliza para una sola clave ---------- */

select pg_temp.como_postgres();
insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000d', 'dani@test.local');
insert into public.inscripciones (user_id, plan_id, activa) values ('00000000-0000-4000-8000-00000000000d', pg_temp.lcd(), true);

create function pg_temp.propia(clave text, codigo text, nombre text, correlativas jsonb default '[]') returns jsonb language sql as $$
  select jsonb_build_object('clave', clave, 'codigo', codigo, 'nombre', nombre, 'anio', 1, 'cuatrimestre', 1,
    'tipo', 'Materia', 'area', null, 'requiereAnioCompletoParaCursar', null, 'correlativas', correlativas)
$$;
create function pg_temp.prog(materia text, estado text) returns jsonb language sql as $$
  select jsonb_build_object('materiaId', materia, 'estado', estado, 'p1', null, 'p2', null, 'rec', null,
    'notaCursada', null, 'notaFinalExamen', null, 'nota', null, 'aplazos', '[]'::jsonb)
$$;
create function pg_temp.datos(propias jsonb, progreso jsonb default '[]') returns jsonb language sql as $$
  select jsonb_build_object('materiasPropias', propias, 'progreso', progreso, 'historial', '[]'::jsonb)
$$;
create function pg_temp.mismo_codigo() returns jsonb language sql as $$
  select pg_temp.datos(
    jsonb_build_array(
      pg_temp.propia('a', 'REP', 'Repetida A'),
      pg_temp.propia('b', 'REP', 'Repetida B', jsonb_build_array(jsonb_build_object('requiere', 'a', 'para', 'rendir', 'condicion', 'aprobada')))),
    jsonb_build_array(pg_temp.prog('a', 'aprobada'), pg_temp.prog('b', 'cursando')))
$$;
create function pg_temp.dani_propias(cod text) returns int language sql as $$
  select count(*)::int from public.materias where owner_id = auth.uid() and codigo = cod
$$;

-- La misma clave de bloqueo en las dos funciones: dani importa, eva activa un plan.
create function pg_temp.tiene_bloqueo(uid uuid) returns boolean language sql as $$
  select exists (
    select 1
    from pg_locks l, (select hashtextextended(uid::text, 0) as clave) k
    where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.mode = 'ExclusiveLock' and l.objsubid = 1
      and l.classid = ((k.clave >> 32) & 4294967295)::oid
      and l.objid = (k.clave & 4294967295)::oid
  )
$$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000e', 'eva@test.local');
select pg_temp.como('00000000-0000-4000-8000-00000000000e');
select ok(not pg_temp.tiene_bloqueo(auth.uid()), 'bloqueo: activar_plan no lo tiene antes');
select public.activar_plan(pg_temp.lcd());
select ok(pg_temp.tiene_bloqueo(auth.uid()), 'bloqueo: activar_plan lo toma');

select pg_temp.como('00000000-0000-4000-8000-00000000000d');
select ok(not pg_temp.tiene_bloqueo(auth.uid()), 'bloqueo: reemplazar_datos_del_plan no lo tiene antes');
create temp table mapa_repetidas on commit drop as
  select public.reemplazar_datos_del_plan(pg_temp.lcd(), pg_temp.mismo_codigo()) as mapa;
grant select on mapa_repetidas to authenticated;

select ok(pg_temp.tiene_bloqueo(auth.uid()), 'bloqueo: reemplazar_datos_del_plan toma el mismo que activar_plan');
select is(pg_temp.dani_propias('REP'), 2, 'mismo código: dos claves crean dos materias, sin fusionar');
select isnt((select mapa ->> 'a' from mapa_repetidas), (select mapa ->> 'b' from mapa_repetidas), 'mismo código: cada clave tiene su uuid');
select is((select nombre from public.materias where id = (select (mapa ->> 'a')::uuid from mapa_repetidas)), 'Repetida A', 'mismo código: la primera conserva su nombre');
select is((select nombre from public.materias where id = (select (mapa ->> 'b')::uuid from mapa_repetidas)), 'Repetida B', 'mismo código: la segunda conserva su nombre');
select is((select estado from public.progreso where materia_id = (select (mapa ->> 'a')::uuid from mapa_repetidas)), 'aprobada', 'mismo código: la primera conserva su progreso');
select is((select estado from public.progreso where materia_id = (select (mapa ->> 'b')::uuid from mapa_repetidas)), 'cursando', 'mismo código: la segunda conserva su progreso');
select is((select requiere_id::text from public.correlativas where materia_id = (select (mapa ->> 'b')::uuid from mapa_repetidas)), (select mapa ->> 'a' from mapa_repetidas), 'mismo código: una puede ser correlativa de la otra');

select is(public.reemplazar_datos_del_plan(pg_temp.lcd(), pg_temp.mismo_codigo()), (select mapa from mapa_repetidas), 'reimportar con código repetido: cada clave vuelve a su materia');
select is(pg_temp.dani_propias('REP'), 2, 'reimportar con código repetido: no crea más');
select is((select count(*)::int from public.progreso where user_id = auth.uid()), 2, 'reimportar con código repetido: un progreso por materia');
select is((select count(*)::int from public.correlativas c where c.materia_id = (select (mapa ->> 'b')::uuid from mapa_repetidas)), 1, 'reimportar con código repetido: conserva la correlativa');

-- Una materia ya existente: la toma la primera clave, en el orden del archivo.
insert into public.materias (id, plan_id, codigo, nombre, anio, owner_id) values
  ('40000000-0000-4000-8000-0000000000d1', pg_temp.lcd(), 'EXI', 'Ya existía', 1, auth.uid());
create temp table mapa_existente on commit drop as
  select public.reemplazar_datos_del_plan(pg_temp.lcd(), pg_temp.datos(
    jsonb_build_array(pg_temp.propia('x', 'EXI', 'Primera'), pg_temp.propia('y', 'EXI', 'Segunda')),
    jsonb_build_array(pg_temp.prog('x', 'final'), pg_temp.prog('y', 'cursando')))) as mapa;
grant select on mapa_existente to authenticated;
select is((select mapa ->> 'x' from mapa_existente), '40000000-0000-4000-8000-0000000000d1', 'una existente: la reutiliza la primera clave');
select isnt((select mapa ->> 'y' from mapa_existente), '40000000-0000-4000-8000-0000000000d1', 'una existente: la segunda clave crea otra');
select is(pg_temp.dani_propias('EXI'), 2, 'una existente: quedan dos materias');
select is((select estado from public.progreso where materia_id = '40000000-0000-4000-8000-0000000000d1'), 'final', 'una existente: guarda el progreso de la primera');
select is((select estado from public.progreso where materia_id = (select (mapa ->> 'y')::uuid from mapa_existente)), 'cursando', 'una existente: y el de la segunda');

-- Sin código coinciden por nombre.
create temp table mapa_sin_codigo on commit drop as
  select public.reemplazar_datos_del_plan(pg_temp.lcd(), pg_temp.datos(
    jsonb_build_array(
      pg_temp.propia('t1', null, 'Taller'),
      pg_temp.propia('t2', '   ', 'Taller', jsonb_build_array(jsonb_build_object('requiere', 't1', 'para', 'cursar', 'condicion', 'regular')))),
    jsonb_build_array(pg_temp.prog('t1', 'aprobada'), pg_temp.prog('t2', 'cursando')))) as mapa;
grant select on mapa_sin_codigo to authenticated;
select is((select count(*)::int from public.materias where owner_id = auth.uid() and nombre = 'Taller' and codigo is null), 2, 'sin código y mismo nombre: dos materias; un código en blanco cuenta como sin código');
select is((select requiere_id::text from public.correlativas where materia_id = (select (mapa ->> 't2')::uuid from mapa_sin_codigo)), (select mapa ->> 't1' from mapa_sin_codigo), 'sin código y mismo nombre: una puede ser correlativa de la otra');
select is((select count(*)::int from public.progreso where materia_id in (select (mapa ->> k)::uuid from mapa_sin_codigo, jsonb_object_keys(mapa) k)), 2, 'sin código y mismo nombre: las dos conservan su progreso');

-- El código del archivo se recorta antes de comparar.
select lives_ok($$select public.reemplazar_datos_del_plan(pg_temp.lcd(), pg_temp.datos(jsonb_build_array(pg_temp.propia('r', '  EXI  ', 'Recortada'))))$$, 'código con espacios: aplica');
select is((select nombre from public.materias where id = '40000000-0000-4000-8000-0000000000d1'), 'Recortada', 'código con espacios: reutiliza la materia con el código recortado');
select is(pg_temp.dani_propias('EXI'), 2, 'una sola clave con dos existentes: la otra se conserva');
select is((select count(*)::int from public.materias where owner_id = auth.uid() and codigo = 'EXI' and nombre = 'Segunda'), 1, 'una sola clave con dos existentes: la otra queda sin cambios');

select pg_temp.como_postgres();
select * from finish();
rollback;
