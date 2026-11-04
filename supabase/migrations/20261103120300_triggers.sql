/* ---------- Perfil al registrarse ---------- */

-- Google manda el nombre en `full_name` o `name` y el avatar en `avatar_url` o `picture`.
create function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.perfiles (id, nombre, avatar_url)
  values (
    new.id,
    coalesce(nullif(btrim(meta ->> 'full_name'), ''), nullif(btrim(meta ->> 'name'), '')),
    coalesce(nullif(btrim(meta ->> 'avatar_url'), ''), nullif(btrim(meta ->> 'picture'), ''))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

/* ---------- updated_at de progreso ---------- */

create function public.poner_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger progreso_updated_at
  before insert or update on public.progreso
  for each row execute function public.poner_updated_at();

/* ---------- Material sin materia ---------- */

-- Al borrar una materia, el FK pone materia_id en null. El CHECK rechazaría un material compartido
-- sin materia, así que este trigger lo pasa a privado antes de que se evalúe. Solo corre cuando
-- materia_id queda null: compartir un material que ya no tenía materia sigue rechazado por el CHECK.
create function public.material_sin_materia_a_privado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.visibilidad := 'privado';
  return new;
end;
$$;

create trigger materiales_sin_materia_a_privado
  before update on public.materiales
  for each row
  when (old.materia_id is not null and new.materia_id is null)
  execute function public.material_sin_materia_a_privado();

/* ---------- Materias del catálogo con datos de alumnos ---------- */

-- Borrar la materia se llevaría en cascada el progreso y el historial de sus alumnos, también si el
-- borrado viene desde el plan. Security definer: la RLS le oculta a quien borra los datos ajenos.
-- El bloqueo de la fila hace esperar a las escrituras en curso y frena las nuevas hasta terminar.
create function public.materia_proteger_datos_de_alumnos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.owner_id is not null then
    return old;
  end if;

  perform 1 from public.materias m where m.id = old.id for update;

  if exists (select 1 from public.progreso p where p.materia_id = old.id)
    or exists (select 1 from public.historial h where h.materia_id = old.id) then
    raise exception 'la materia % del catálogo tiene progreso o historial de alumnos', old.codigo
      using errcode = '23503';
  end if;

  return old;
end;
$$;

create trigger materias_proteger_datos_de_alumnos
  before delete on public.materias
  for each row execute function public.materia_proteger_datos_de_alumnos();

/* ---------- materiales.oculto ---------- */

-- Solo cambian `oculto` un admin o el trigger de denuncias. El trigger de denuncias corre dentro de
-- la sesión de quien denuncia, así que auth.uid() no sirve para reconocerlo. Lo que lo distingue es
-- current_user: esta función es security invoker, y dentro de la función security definer del
-- trigger de denuncias current_user es el dueño (postgres), mientras que un usuario que escribe
-- directo es `authenticated`. Lo mismo pasa con los FK, que corren como dueño de la tabla.
-- Ninguna función security definer de este esquema ejecuta SQL recibido del usuario.
--
-- De paso limita la política de admin: sobre material ajeno, un admin solo puede cambiar `oculto`.
create function public.material_proteger_oculto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.oculto and not public.es_admin() then
      raise exception 'solo un admin puede ocultar un material' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.oculto is distinct from old.oculto and not public.es_admin() then
    raise exception 'solo un admin puede cambiar si un material está oculto' using errcode = '42501';
  end if;

  if old.user_id is distinct from auth.uid()
    and (to_jsonb(new) - 'oculto') is distinct from (to_jsonb(old) - 'oculto') then
    raise exception 'sobre material ajeno un admin solo puede cambiar si está oculto' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger materiales_proteger_oculto
  before insert or update on public.materiales
  for each row execute function public.material_proteger_oculto();

/* ---------- Denuncias ---------- */

-- Security definer: quien denuncia no tiene permiso sobre un material ajeno. El bloqueo de la fila
-- evita que dos denuncias simultáneas cuenten 2 cada una y ninguna llegue a ocultar.
create function public.ocultar_material_denunciado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.materiales m where m.id = new.material_id for update;

  if (select count(*) from public.denuncias d where d.material_id = new.material_id) >= 3 then
    update public.materiales m set oculto = true where m.id = new.material_id and not m.oculto;
  end if;

  return new;
end;
$$;

create trigger denuncias_ocultar_material
  after insert on public.denuncias
  for each row execute function public.ocultar_material_denunciado();
