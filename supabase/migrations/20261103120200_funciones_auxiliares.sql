-- Funciones que usan las políticas de RLS (docs/arquitectura.md §5). Son security definer para
-- que una política pueda consultar otras tablas sin recursión ni depender de la RLS de esas tablas.

create function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.es_admin from public.perfiles p where p.id = auth.uid()), false);
$$;

create function public.cursa_o_curso(materia_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.progreso p
    where p.user_id = auth.uid()
      and p.materia_id = cursa_o_curso.materia_id
      and p.estado in ('cursando', 'final', 'aprobada')
  );
$$;

create function public.plan_visible(plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.planes p
    where p.id = plan_visible.plan_id
      and (p.estado = 'publicado' or p.creado_por = auth.uid() or public.es_admin())
  );
$$;

-- Admin, o el creador mientras el plan esté pendiente.
create function public.plan_editable(plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.planes p
    where p.id = plan_editable.plan_id
      and (public.es_admin() or (p.estado = 'pendiente' and p.creado_por = auth.uid()))
  );
$$;

create function public.materia_visible(materia_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.materias m
    where m.id = materia_visible.materia_id
      and (m.owner_id is null or m.owner_id = auth.uid())
      and public.plan_visible(m.plan_id)
  );
$$;

-- Materias propias: el dueño. Catálogo: admin o creador de un plan pendiente.
create function public.materia_editable(materia_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.materias m
    where m.id = materia_editable.materia_id
      and (m.owner_id = auth.uid() or (m.owner_id is null and public.plan_editable(m.plan_id)))
  );
$$;

-- Se puede editar la materia y la correlativa apunta a una materia visible del mismo plan.
-- Una materia del catálogo no puede depender de la materia propia de un alumno.
create function public.correlativa_permitida(materia_id uuid, requiere_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.materia_editable(correlativa_permitida.materia_id)
    and public.materia_visible(correlativa_permitida.requiere_id)
    and exists (
      select 1
      from public.materias m
      join public.materias r on r.plan_id = m.plan_id
      where m.id = correlativa_permitida.materia_id
        and r.id = correlativa_permitida.requiere_id
        and (m.owner_id is not null or r.owner_id is null)
    );
$$;

-- Decisión de la fase 0: progreso solo sobre materias propias o de un plan donde el alumno está
-- inscripto, para que no pueda destrabar material de otra carrera.
create function public.puede_registrar_progreso(materia_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.materias m
    where m.id = puede_registrar_progreso.materia_id
      and (
        m.owner_id = auth.uid()
        or (
          m.owner_id is null
          and exists (
            select 1
            from public.inscripciones i
            where i.user_id = auth.uid() and i.plan_id = m.plan_id
          )
        )
      )
  );
$$;

-- Propio, de admin, o compartido y no oculto de una materia que el usuario cursa o cursó.
create function public.material_visible(material_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.materiales m
    where m.id = material_visible.material_id
      and (
        m.user_id = auth.uid()
        or public.es_admin()
        or (m.visibilidad = 'compartido' and not m.oculto and public.cursa_o_curso(m.materia_id))
      )
  );
$$;

-- La fila de documentos lleva el sha256, que nunca se expone a quien no tiene el documento: un
-- material compartido ajeno no alcanza para leerla.
create function public.documento_propio(documento_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.materiales m
    where m.documento_id = documento_propio.documento_id
      and m.user_id = auth.uid()
  );
$$;
