-- Embudo del onboarding para #admin (decisión del 2026-11-17): solo totales.
--
-- - `inscripciones.importado_en`: la última vez que el alumno importó un respaldo en ese plan. La llena
--   reemplazar_datos_del_plan. Cuenta solo desde esta migración: las importaciones anteriores no quedaron
--   registradas.
-- - `metricas_admin()` suma `embudo`: registrados → eligieron carrera → cargaron al menos una materia →
--   importaron un respaldo.

alter table public.inscripciones add column importado_en timestamptz;

/* ---------- reemplazar_datos_del_plan: igual que antes, más importado_en ---------- */

create or replace function public.reemplazar_datos_del_plan(plan_id uuid, datos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_plan uuid := reemplazar_datos_del_plan.plan_id;
  v_propias jsonb := reemplazar_datos_del_plan.datos -> 'materiasPropias';
  v_progreso jsonb := reemplazar_datos_del_plan.datos -> 'progreso';
  v_mapa jsonb := '{}';
  v_usadas uuid[] := '{}';
  v_claves jsonb;
  v_orden integer;
  v_materia jsonb;
  v_clave text;
  v_codigo text;
  v_id uuid;
  v_ref text;
begin
  if v_uid is null then
    raise exception 'hace falta una sesión' using errcode = '42501';
  end if;

  -- El mismo bloqueo que activar_plan: dos importaciones simultáneas no se mezclan.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  if not public.plan_visible(v_plan) then
    raise exception 'el plan no existe o no es visible' using errcode = '42501';
  end if;

  if jsonb_typeof(v_propias) is distinct from 'array'
    or jsonb_typeof(v_progreso) is distinct from 'array' then
    raise exception 'datos debe tener materiasPropias y progreso como listas'
      using errcode = '22023';
  end if;

  select coalesce(max(m.orden), 0) into v_orden from public.materias m where m.plan_id = v_plan;

  for v_materia in select e from jsonb_array_elements(v_propias) e loop
    v_clave := v_materia ->> 'clave';
    v_codigo := nullif(btrim(v_materia ->> 'codigo'), '');

    if v_clave is null or v_mapa ? v_clave then
      raise exception 'clave de materia propia vacía o repetida: %', v_clave using errcode = '22023';
    end if;

    select m.id into v_id
    from public.materias m
    where m.plan_id = v_plan
      and m.owner_id = v_uid
      and not m.id = any (v_usadas)
      and (
        (v_codigo is not null and m.codigo = v_codigo)
        or (v_codigo is null and m.codigo is null and m.nombre = v_materia ->> 'nombre')
      )
    order by m.created_at, m.orden, m.id
    limit 1;

    if v_id is null then
      v_orden := v_orden + 1;
      insert into public.materias as m
        (plan_id, owner_id, codigo, nombre, anio, cuatrimestre, tipo, area, requiere_anio_completo_para_cursar, orden)
      values (
        v_plan,
        v_uid,
        v_codigo,
        v_materia ->> 'nombre',
        (v_materia ->> 'anio')::integer,
        (v_materia ->> 'cuatrimestre')::integer,
        v_materia ->> 'tipo',
        v_materia ->> 'area',
        (v_materia ->> 'requiereAnioCompletoParaCursar')::integer,
        v_orden
      )
      returning m.id into v_id;
    else
      update public.materias m set
        nombre = v_materia ->> 'nombre',
        anio = (v_materia ->> 'anio')::integer,
        cuatrimestre = (v_materia ->> 'cuatrimestre')::integer,
        tipo = v_materia ->> 'tipo',
        area = v_materia ->> 'area',
        requiere_anio_completo_para_cursar = (v_materia ->> 'requiereAnioCompletoParaCursar')::integer
      where m.id = v_id;

      delete from public.correlativas c where c.materia_id = v_id;
    end if;

    v_usadas := v_usadas || v_id;
    v_mapa := v_mapa || jsonb_build_object(v_clave, v_id);
  end loop;

  v_claves := v_mapa;

  for v_ref in
    select p ->> 'materiaId' from jsonb_array_elements(v_progreso) p
    union
    select c ->> 'requiere'
    from jsonb_array_elements(v_propias) m
    cross join lateral jsonb_array_elements(m -> 'correlativas') c
  loop
    if v_ref is null then
      raise exception 'hay una fila sin materia' using errcode = '22023';
    end if;

    if not v_mapa ? v_ref then
      -- Visible para el alumno por RLS: una materia propia ajena cuenta como inexistente.
      if v_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or not exists (select 1 from public.materias m where m.id = v_ref::uuid and m.plan_id = v_plan) then
        raise exception 'la materia % no está en este plan', v_ref using errcode = '22023';
      end if;
      v_mapa := v_mapa || jsonb_build_object(v_ref, v_ref);
    end if;
  end loop;

  insert into public.correlativas as c (materia_id, requiere_id, para, condicion)
  select
    (v_mapa ->> (m ->> 'clave'))::uuid,
    (v_mapa ->> (r ->> 'requiere'))::uuid,
    r ->> 'para',
    r ->> 'condicion'
  from jsonb_array_elements(v_propias) m
  cross join lateral jsonb_array_elements(m -> 'correlativas') r
  on conflict (materia_id, requiere_id, para) do update set condicion = excluded.condicion;

  delete from public.progreso p
  using public.materias m
  where p.materia_id = m.id and m.plan_id = v_plan and p.user_id = v_uid;

  -- Las instancias se van en cascada con su fila de progreso.
  insert into public.progreso (user_id, materia_id, estado)
  select v_uid, (v_mapa ->> (f ->> 'materiaId'))::uuid, f ->> 'estado'
  from jsonb_array_elements(v_progreso) f;

  insert into public.instancias (user_id, materia_id, tipo, fecha, nota, orden, fuente)
  select
    v_uid,
    (v_mapa ->> (f ->> 'materiaId'))::uuid,
    i.valor ->> 'tipo',
    (i.valor ->> 'fecha')::date,
    (i.valor ->> 'nota')::numeric,
    i.posicion::integer - 1,
    coalesce(i.valor ->> 'fuente', 'manual')
  from jsonb_array_elements(v_progreso) f
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(f -> 'instancias') = 'array' then f -> 'instancias' else '[]'::jsonb end
  ) with ordinality as i (valor, posicion);

  -- Para el embudo de #admin. Corre con los permisos del alumno: solo toca su inscripción.
  update public.inscripciones i set importado_en = now()
  where i.user_id = v_uid and i.plan_id = v_plan;

  return v_claves;
end;
$$;

/* ---------- metricas_admin: igual que antes, más embudo ---------- */

create or replace function public.metricas_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hace_7_dias timestamptz := now() - interval '7 days';
begin
  if not public.es_admin() then
    raise exception 'solo para admins' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'alumnos', (select count(*) from public.perfiles),
    'alumnosNuevos7Dias', (select count(*) from public.perfiles where created_at > hace_7_dias),
    'alumnosConInscripcionActiva',
      (select count(distinct user_id) from public.inscripciones where activa),
    'alumnosConMaterias', (select count(distinct user_id) from public.progreso),
    -- Activos: cargaron o modificaron algo (progreso, instancias, materias propias, material).
    'alumnosActivos7Dias', (select count(*) from (
        select user_id from public.progreso where updated_at > hace_7_dias
        union select user_id from public.instancias where created_at > hace_7_dias
        union select owner_id from public.materias where owner_id is not null and created_at > hace_7_dias
        union select user_id from public.materiales where created_at > hace_7_dias
      ) activos),
    'inscripcionesPorPlan', (select coalesce(jsonb_agg(jsonb_build_object(
        'universidad', u.sigla, 'carrera', c.sigla, 'plan', p.version, 'alumnos', i.alumnos)
        order by i.alumnos desc, u.sigla, c.sigla, p.version), '[]'::jsonb)
      from (select plan_id, count(*) as alumnos from public.inscripciones where activa group by plan_id) i
      join public.planes p on p.id = i.plan_id
      join public.carreras c on c.id = p.carrera_id
      join public.universidades u on u.id = c.universidad_id),
    'materiasConProgreso', (select count(*) from public.progreso),
    'instancias', (select count(*) from public.instancias),
    'materiasPropias', (select count(*) from public.materias where owner_id is not null),
    'materiales', jsonb_build_object(
      'archivo', (select count(*) from public.materiales where tipo = 'archivo'),
      'link', (select count(*) from public.materiales where tipo = 'link'),
      'nota', (select count(*) from public.materiales where tipo = 'nota')),
    'documentos', (select count(*) from public.documentos),
    'reportes', (select count(*) from public.reportes),
    'reportes7Dias', (select count(*) from public.reportes where created_at > hace_7_dias),
    'embudo', jsonb_build_object(
      'registrados', (select count(*) from public.perfiles),
      'eligieronCarrera', (select count(distinct user_id) from public.inscripciones),
      'cargaronMaterias', (select count(distinct user_id) from public.progreso),
      'importaronRespaldo',
        (select count(distinct user_id) from public.inscripciones where importado_en is not null))
  );
end;
$$;

-- `create or replace` conserva los permisos de las dos funciones: no hace falta repetir los grants.
