-- Reportes de problemas y sugerencias, y métricas para el admin (decisiones del 2026-11-16,
-- docs/backlog.md §2). Topes: de 1 a 1000 caracteres y hasta 5 por alumno cada 24 horas corridas.

/* ---------- reportes ---------- */

create table public.reportes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null constraint reportes_tipo_valido check (tipo in ('problema', 'sugerencia')),
  texto text not null constraint reportes_texto_largo check (char_length(btrim(texto)) between 1 and 1000),
  -- Desde dónde se reportó, por ejemplo "materiales".
  vista text constraint reportes_vista_larga check (char_length(vista) <= 30),
  -- Solo si el alumno lo marca, el admin ve su mail (reportes_admin).
  contactable boolean not null default false,
  -- Datos técnicos sin identidad: nombre y versión principal, no el user agent entero.
  navegador text constraint reportes_navegador_largo check (char_length(navegador) <= 60),
  sistema text constraint reportes_sistema_largo check (char_length(sistema) <= 60),
  version_app text constraint reportes_version_larga check (char_length(version_app) <= 40),
  created_at timestamptz not null default now()
);

create index reportes_user_id_created_at on public.reportes (user_id, created_at desc);

/*
 * Fija el autor y la fecha (nadie reporta a nombre de otro ni con una fecha vieja para saltear el
 * tope) y aplica el tope de 5 cada 24 horas. Security definer: el alumno no puede leer reportes, ni
 * los suyos, así que contarlos necesita otro rol. El lock serializa dos envíos al mismo tiempo.
 */
create function public.reportes_antes_de_insertar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'hace falta una sesión' using errcode = '42501';
  end if;
  new.user_id := v_uid;
  new.created_at := now();

  perform pg_advisory_xact_lock(hashtextextended('reportes:' || v_uid::text, 0));
  if (select count(*) from public.reportes r
      where r.user_id = v_uid and r.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'llegaste al máximo de reportes por día' using errcode = 'EQ005';
  end if;
  return new;
end;
$$;

create trigger reportes_antes_de_insertar
  before insert on public.reportes
  for each row execute function public.reportes_antes_de_insertar();

alter table public.reportes enable row level security;

-- El alumno solo inserta, y solo lo suyo. No lee, no cambia ni borra: el admin los lee por RPC.
create policy reportes_insert on public.reportes for insert to authenticated
  with check (user_id = (select auth.uid()));

grant insert (tipo, texto, vista, contactable, navegador, sistema, version_app)
  on public.reportes to authenticated;
grant all on public.reportes to service_role;

/* ---------- Para el admin ---------- */

-- Los últimos reportes, sin identidad salvo el mail de quien marcó "Pueden contactarme".
create function public.reportes_admin(limite integer default 50)
returns table (
  id uuid,
  created_at timestamptz,
  tipo text,
  texto text,
  vista text,
  contacto text,
  navegador text,
  sistema text,
  version_app text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'solo para admins' using errcode = '42501';
  end if;
  return query
    select r.id, r.created_at, r.tipo, r.texto, r.vista,
           case when r.contactable then u.email::text end,
           r.navegador, r.sistema, r.version_app
    from public.reportes r
    left join auth.users u on u.id = r.user_id
    order by r.created_at desc
    limit least(greatest(coalesce(limite, 50), 1), 200);
end;
$$;

-- Solo totales: nunca ids ni datos de un alumno.
create function public.metricas_admin()
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
    'reportes7Dias', (select count(*) from public.reportes where created_at > hace_7_dias)
  );
end;
$$;

/* ---------- Permisos de las funciones nuevas ---------- */

-- Postgres da EXECUTE a PUBLIC al crear una función: se cierra y se abre solo lo que corresponde.
revoke execute on function
  public.reportes_antes_de_insertar(),
  public.reportes_admin(integer),
  public.metricas_admin()
from public, anon, authenticated;

grant execute on function public.reportes_admin(integer), public.metricas_admin() to authenticated;
grant execute on function
  public.reportes_antes_de_insertar(),
  public.reportes_admin(integer),
  public.metricas_admin()
to service_role;
