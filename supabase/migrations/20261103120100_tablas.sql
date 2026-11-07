-- Modelo de datos: docs/arquitectura.md §4, más las decisiones de "plan de la fase 0" en
-- docs/decisiones.md. Las notas no se validan contra la escala acá porque dependen del plan.

/* ---------- 4.1 Catálogo ---------- */

create table public.universidades (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  sigla text,
  sede text,
  estado text not null default 'pendiente' check (estado in ('publicado', 'pendiente')),
  creado_por uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.carreras (
  id uuid primary key default gen_random_uuid(),
  -- Sin cascadas entre universidad, carrera y plan: un padre con hijos no se borra, ni siquiera pendiente.
  universidad_id uuid not null references public.universidades (id) on delete restrict,
  nombre text not null,
  sigla text,
  estado text not null default 'pendiente' check (estado in ('publicado', 'pendiente')),
  creado_por uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index carreras_universidad_id_idx on public.carreras (universidad_id);

create table public.planes (
  id uuid primary key default gen_random_uuid(),
  carrera_id uuid not null references public.carreras (id) on delete restrict,
  version text not null,
  estado text not null default 'pendiente' check (estado in ('publicado', 'pendiente')),
  creado_por uuid default auth.uid() references auth.users (id) on delete set null,
  nota_min numeric not null default 1,
  nota_max numeric not null default 10,
  nota_aprobacion numeric not null default 4,
  cuatrimestres_por_anio integer not null default 2 check (cuatrimestres_por_anio > 0),
  cierre_cuatrimestres jsonb not null default '[]' check (jsonb_typeof(cierre_cuatrimestres) = 'array'),
  created_at timestamptz not null default now(),
  unique (carrera_id, version),
  check (nota_min < nota_max and nota_aprobacion between nota_min and nota_max)
);

create table public.materias (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.planes (id) on delete cascade,
  codigo text,
  nombre text not null,
  anio integer not null check (anio >= 0),
  cuatrimestre integer check (cuatrimestre > 0),
  tipo text not null default 'Materia',
  area text,
  requiere_anio_completo_para_cursar integer check (requiere_anio_completo_para_cursar > 0),
  owner_id uuid references auth.users (id) on delete cascade,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  -- El código solo puede faltar en materias propias: el catálogo siempre lo tiene.
  constraint materias_catalogo_con_codigo check (owner_id is not null or codigo is not null)
);

create unique index materias_catalogo_codigo_unico on public.materias (plan_id, codigo) where owner_id is null;
create index materias_propias_idx on public.materias (owner_id, plan_id) where owner_id is not null;

create table public.correlativas (
  materia_id uuid not null references public.materias (id) on delete cascade,
  requiere_id uuid not null references public.materias (id) on delete cascade,
  para text not null check (para in ('cursar', 'rendir')),
  condicion text not null check (condicion in ('regular', 'aprobada')),
  primary key (materia_id, requiere_id, para),
  constraint correlativas_no_a_si_misma check (materia_id <> requiere_id)
);

create index correlativas_requiere_id_idx on public.correlativas (requiere_id);

/* ---------- 4.2 Alumno ---------- */

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text,
  avatar_url text,
  es_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.inscripciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Restrict: borrar un plan con alumnos se llevaría sus datos. También frena borrar su carrera o universidad.
  plan_id uuid not null references public.planes (id) on delete restrict,
  activa boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, plan_id)
);

create unique index inscripciones_una_activa_por_usuario on public.inscripciones (user_id) where activa;
create index inscripciones_plan_id_idx on public.inscripciones (plan_id);

create table public.progreso (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  materia_id uuid not null references public.materias (id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'cursando', 'final', 'aprobada')),
  p1 numeric,
  p2 numeric,
  rec numeric,
  nota_cursada numeric,
  nota_final_examen numeric,
  nota numeric,
  aplazos numeric[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, materia_id)
);

create index progreso_materia_id_idx on public.progreso (materia_id);

create table public.historial (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  materia_id uuid not null references public.materias (id) on delete cascade,
  fecha date not null,
  tipo text not null check (tipo in ('Regularidad', 'Examen', 'Promocion', 'En curso')),
  nota numeric,
  resultado text not null check (resultado in ('Aprobado', 'Reprobado', 'Ausente', 'Promocionado', 'En curso')),
  fuente text not null default 'manual' check (fuente in ('siu', 'manual', 'ia'))
);

create index historial_user_id_materia_id_idx on public.historial (user_id, materia_id);
create index historial_materia_id_idx on public.historial (materia_id);

/* ---------- 4.3 Material ---------- */

-- Un tsvector no pasa de 1 MB y un texto de 2 MB con muchas palabras distintas no entra. El texto se
-- guarda entero; lo que se indexa es el prefijo más largo que entra: se prueba con todo y, si no
-- entra, con la mitad. Un documento real casi siempre entra entero.
create function public.documento_texto_tsv(texto text)
returns tsvector
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_largo integer := char_length(texto);
begin
  loop
    begin
      return to_tsvector('pg_catalog.spanish'::regconfig, left(texto, v_largo));
    exception when program_limit_exceeded then
      v_largo := v_largo / 2;
    end;
  end loop;
end;
$$;

create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  sha256 text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  mime text,
  bytes bigint check (bytes >= 0),
  paginas integer check (paginas >= 0),
  texto text,
  texto_tsv tsvector generated always as (public.documento_texto_tsv(coalesce(texto, ''))) stored,
  extraido_con text check (extraido_con in ('pdfjs', 'ocr', 'ia')),
  created_at timestamptz not null default now()
);

create index documentos_texto_tsv_idx on public.documentos using gin (texto_tsv);

-- Una sola fila, sin acceso desde la API. Se cambia con un UPDATE, sin tocar código.
create table public.limites_documentos (
  id boolean primary key default true check (id),
  max_bytes_texto bigint not null check (max_bytes_texto > 0),
  cuota_bytes_por_usuario bigint not null check (cuota_bytes_por_usuario > 0)
);

insert into public.limites_documentos (max_bytes_texto, cuota_bytes_por_usuario)
values (2097152, 52428800);

-- Lo que registrar_documento le cobró a cada usuario por cada documento. Sin acceso desde la API.
create table public.uso_documentos (
  user_id uuid not null references auth.users (id) on delete cascade,
  documento_id uuid not null references public.documentos (id) on delete cascade,
  bytes bigint not null check (bytes > 0),
  primary key (user_id, documento_id)
);

create index uso_documentos_documento_id_idx on public.uso_documentos (documento_id);

create table public.materiales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  materia_id uuid references public.materias (id) on delete set null,
  tipo text not null check (tipo in ('archivo', 'link', 'nota')),
  titulo text not null,
  documento_id uuid references public.documentos (id),
  url text,
  texto text,
  drive_file_id text,
  visibilidad text not null default 'privado' check (visibilidad in ('privado', 'compartido')),
  anonimo boolean not null default false,
  periodo text,
  oculto boolean not null default false,
  created_at timestamptz not null default now(),
  -- La fija siempre el trigger material_fijar_compartido_en, nunca el cliente.
  compartido_en timestamptz,
  -- Sin materia no hay comunidad con quien compartir.
  constraint materiales_compartido_con_materia check (visibilidad = 'privado' or materia_id is not null),
  -- Un `javascript:` guardado se ejecutaría al abrir el link.
  constraint materiales_url_http check (url ~* '^https?://'),
  -- Topes para que la base no se pueda llenar por acá: documentos ya tiene los suyos (arquitectura §7).
  constraint materiales_titulo_largo check (char_length(titulo) <= 200),
  constraint materiales_url_largo check (char_length(url) <= 2048),
  constraint materiales_texto_largo check (octet_length(texto) <= 51200),
  -- Cada tipo lleva su contenido y solo ese.
  constraint materiales_contenido_segun_tipo check (
    case tipo
      when 'archivo' then documento_id is not null and url is null and texto is null
      when 'link' then url is not null and documento_id is null and texto is null and drive_file_id is null
      when 'nota' then texto is not null and documento_id is null and url is null and drive_file_id is null
    end
  )
);

create index materiales_user_id_idx on public.materiales (user_id);
create index materiales_materia_id_idx on public.materiales (materia_id);
create index materiales_documento_id_idx on public.materiales (documento_id);

create table public.denuncias (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materiales (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  motivo text,
  created_at timestamptz not null default now(),
  unique (material_id, user_id)
);

create index denuncias_user_id_idx on public.denuncias (user_id);
