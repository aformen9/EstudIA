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

/* ---------- Material compartido que cambia de materia ---------- */

-- Compartir es una decisión por materia: un material compartido que se mueve pasa a privado, aunque
-- el mismo UPDATE pida otra cosa. También cubre el borrado de la materia: el FK pone materia_id en
-- null y el CHECK rechazaría un compartido sin materia. No toca `oculto`, así que lo oculto sigue
-- oculto. Solo mira materiales que ya estaban compartidos: compartir uno sin materia sigue rechazado
-- por el CHECK.
create function public.material_cambio_de_materia_a_privado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.visibilidad := 'privado';
  return new;
end;
$$;

create trigger materiales_cambio_de_materia_a_privado
  before update on public.materiales
  for each row
  when (old.visibilidad = 'compartido' and old.materia_id is distinct from new.materia_id)
  execute function public.material_cambio_de_materia_a_privado();

/* ---------- Cuándo se compartió un material ---------- */

-- `created_at` la puede elegir el cliente, porque restaurar conserva las fechas: no sirve para ordenar
-- el material compartido. Esta fecha la fija siempre el servidor y pisa lo que venga del cliente.
-- El trigger se llama "fijar" para correr después de materiales_cambio_de_materia_a_privado: los
-- triggers corren por orden alfabético, y este tiene que ver la visibilidad ya corregida.
create function public.material_fijar_compartido_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visibilidad <> 'compartido' then
    new.compartido_en := null;
  elsif tg_op = 'UPDATE' and old.visibilidad = 'compartido' then
    new.compartido_en := old.compartido_en;
  else
    new.compartido_en := now();
  end if;
  return new;
end;
$$;

create trigger materiales_fijar_compartido_en
  before insert or update on public.materiales
  for each row execute function public.material_fijar_compartido_en();

/* ---------- Un material no cambia de autor ---------- */

-- Vale para todos los roles, admin y service_role incluidos.
create function public.material_proteger_autor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'un material no puede cambiar de autor' using errcode = '42501';
end;
$$;

create trigger materiales_autor_fijo
  before update on public.materiales
  for each row
  when (old.user_id is distinct from new.user_id)
  execute function public.material_proteger_autor();

/* ---------- Material con fecha futura ---------- */

-- La restauración conserva las fechas pasadas; una futura lo dejaría primero en la lista para siempre.
-- En un UPDATE solo corrige una fecha que cambió: una transacción que empezó antes de que se creara
-- la fila tiene un now() anterior, y no por eso hay que mover la fecha.
create function public.material_sin_fecha_futura()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_at > now() and (tg_op = 'INSERT' or new.created_at is distinct from old.created_at) then
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger materiales_sin_fecha_futura
  before insert or update on public.materiales
  for each row execute function public.material_sin_fecha_futura();

/* ---------- Materia sin cambio de dueño ni de plan ---------- */

-- El trigger de borrado de abajo solo protege a las materias del catálogo: si alguien pudiera ponerse
-- de dueño, después podría borrar una con datos de alumnos. Cambiar de plan dejaría el progreso de sus
-- alumnos colgando de otra carrera. Vale para todos los roles, admin y service_role incluidos.
create function public.materia_proteger_dueno_y_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'una materia no puede cambiar de dueño ni de plan' using errcode = '42501';
end;
$$;

create trigger materias_proteger_dueno_y_plan
  before update on public.materias
  for each row
  when (old.owner_id is distinct from new.owner_id or old.plan_id is distinct from new.plan_id)
  execute function public.materia_proteger_dueno_y_plan();

/* ---------- Código de una materia ---------- */

-- Sin espacios en las puntas, y vacío es null. El catálogo exige código: ahí el CHECK rechaza el vacío.
-- reemplazar_datos_del_plan compara con esta misma regla.
create function public.materia_normalizar_codigo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.codigo := nullif(btrim(new.codigo), '');
  return new;
end;
$$;

create trigger materias_normalizar_codigo
  before insert or update on public.materias
  for each row execute function public.materia_normalizar_codigo();

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

/* ---------- Planes con materias propias ---------- */

-- `materias.plan_id` va en cascada: sin esto, borrar un plan sin inscripciones se llevaría las materias
-- propias de un alumno dado de baja, con su progreso e historial. Security definer: la RLS le oculta a
-- quien borra las materias de los demás. Las del catálogo las cuida el trigger de arriba.
create function public.plan_proteger_materias_propias()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.materias m where m.plan_id = old.id and m.owner_id is not null) then
    raise exception 'el plan % tiene materias propias de alumnos', old.version
      using errcode = '23503';
  end if;

  return old;
end;
$$;

create trigger planes_proteger_materias_propias
  before delete on public.planes
  for each row execute function public.plan_proteger_materias_propias();

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
