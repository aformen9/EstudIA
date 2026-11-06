-- Los parámetros usan los nombres de docs/arquitectura.md porque son los que recibe la API.
-- `#variable_conflict use_column` hace que un nombre sin calificar sea siempre la columna.

/* ---------- registrar_documento ---------- */

-- Upsert por sha256. Lo que ya está cargado no se pisa: solo se completa lo que era null, para que
-- nadie que conozca el hash reemplace el texto de un documento compartido.
--
-- Límites (docs/arquitectura.md §7). Cada caso tiene su SQLSTATE, que la app traduce para el alumno:
--   EQ001 texto demasiado grande · EQ002 cuota superada · EQ003 archivo demasiado grande · EQ004 mime demasiado largo
--
-- Costo: bytes del texto recortado más 1 KB fijo, para que registrar hashes sin texto también tenga
-- tope. Todos los errores se deciden antes de tocar `documentos` y sin mirar esa tabla: se cobra lo
-- mismo exista o no el documento, así que la respuesta no revela si un hash ya está registrado. Lo
-- único que se consulta es lo que este usuario ya pagó.
--
-- Registrar otra vez cobra solo la diferencia con lo ya pagado. Si no, registrar sin texto y volver
-- con 2 MB esquivaría la cuota por 1 KB. Un reintento sale gratis, aunque el usuario esté sin cuota.
-- Borrar un material no devuelve nada: el texto sigue en la base.
create function public.registrar_documento(
  sha256 text,
  mime text default null,
  bytes bigint default null,
  paginas integer default null,
  texto text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_max_bytes_archivo constant bigint := 52428800; -- 50 MB, el mismo tope que el cliente (§7).
  v_max_largo_mime constant integer := 255; -- RFC 6838: hasta 127 caracteres por parte.
  v_costo_fijo constant bigint := 1024;
  v_uid uuid := auth.uid();
  v_texto text := nullif(btrim(registrar_documento.texto), '');
  v_costo bigint;
  v_pagado bigint;
  v_usado bigint;
  v_limites public.limites_documentos;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'hace falta una sesión' using errcode = '42501';
  end if;

  if registrar_documento.bytes > v_max_bytes_archivo then
    raise exception 'el archivo supera el tamaño máximo permitido' using errcode = 'EQ003';
  end if;

  if char_length(registrar_documento.mime) > v_max_largo_mime then
    raise exception 'el tipo de archivo es demasiado largo' using errcode = 'EQ004';
  end if;

  select l.* into strict v_limites from public.limites_documentos l;

  v_costo := coalesce(octet_length(v_texto), 0) + v_costo_fijo;

  if coalesce(octet_length(v_texto), 0) > v_limites.max_bytes_texto then
    raise exception 'el texto del documento supera el tamaño máximo permitido' using errcode = 'EQ001';
  end if;

  -- Sin esto, dos registros simultáneos del mismo usuario podrían pasar la cuota entre los dos.
  perform pg_advisory_xact_lock(hashtextextended('uso_documentos:' || v_uid::text, 0));

  select u.bytes into v_pagado
  from public.uso_documentos u
  join public.documentos d on d.id = u.documento_id
  where u.user_id = v_uid and d.sha256 = registrar_documento.sha256;

  if v_costo > coalesce(v_pagado, 0) then
    select coalesce(sum(u.bytes), 0) into v_usado from public.uso_documentos u where u.user_id = v_uid;

    if v_usado + v_costo - coalesce(v_pagado, 0) > v_limites.cuota_bytes_por_usuario then
      raise exception 'se superó la cuota de documentos del usuario' using errcode = 'EQ002';
    end if;
  end if;

  insert into public.documentos as d (sha256, mime, bytes, paginas, texto)
  values (
    registrar_documento.sha256,
    registrar_documento.mime,
    registrar_documento.bytes,
    registrar_documento.paginas,
    v_texto
  )
  on conflict (sha256) do update set
    mime = coalesce(d.mime, excluded.mime),
    bytes = coalesce(d.bytes, excluded.bytes),
    paginas = coalesce(d.paginas, excluded.paginas),
    texto = coalesce(d.texto, excluded.texto)
  returning d.id into v_id;

  insert into public.uso_documentos as u (user_id, documento_id, bytes)
  values (v_uid, v_id, v_costo)
  on conflict (user_id, documento_id) do update set bytes = greatest(u.bytes, excluded.bytes);

  return v_id;
end;
$$;

/* ---------- material_compartido ---------- */

-- No devuelve drive_file_id (apunta al Drive del autor) ni materia_id (lo pasa quien llama).
-- El autor es null si el material es anónimo.
--
-- Ordena y fecha por compartido_en, que fija el servidor. No devuelve created_at: la elige el cliente.
--
-- Del documento devuelve solo metadatos: ni sha256 ni documento_id. Con el id alcanzaría para crear
-- un material propio que lo referencie y leer así la fila completa, hash incluido.
create function public.material_compartido(materia_id uuid)
returns table (
  id uuid,
  tipo text,
  titulo text,
  documento_mime text,
  documento_bytes bigint,
  documento_paginas integer,
  url text,
  texto text,
  anonimo boolean,
  periodo text,
  compartido_en timestamptz,
  autor_id uuid,
  autor_nombre text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id,
    m.tipo,
    m.titulo,
    d.mime,
    d.bytes,
    d.paginas,
    m.url,
    m.texto,
    m.anonimo,
    m.periodo,
    m.compartido_en,
    case when m.anonimo then null else m.user_id end,
    case when m.anonimo then null else p.nombre end
  from public.materiales m
  left join public.perfiles p on p.id = m.user_id
  left join public.documentos d on d.id = m.documento_id
  where m.materia_id = material_compartido.materia_id
    and m.visibilidad = 'compartido'
    and not m.oculto
    and public.cursa_o_curso(material_compartido.materia_id)
  order by m.compartido_en desc, m.id;
$$;

/* ---------- activar_plan ---------- */

-- Se inscribe si hace falta y deja ese plan como el único activo. Corre con los permisos del alumno:
-- la RLS rechaza un plan que no puede ver. El bloqueo por usuario serializa dos activaciones
-- simultáneas, que si no chocarían contra el único parcial de inscripción activa.
create function public.activar_plan(plan_id uuid)
returns public.inscripciones
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_plan uuid := activar_plan.plan_id;
  v_inscripcion public.inscripciones;
begin
  if v_uid is null then
    raise exception 'hace falta una sesión' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  update public.inscripciones i
  set activa = false
  where i.user_id = v_uid and i.activa and i.plan_id <> v_plan;

  insert into public.inscripciones as i (user_id, plan_id, activa)
  values (v_uid, v_plan, true)
  on conflict (user_id, plan_id) do update set activa = true
  returning i.* into v_inscripcion;

  return v_inscripcion;
end;
$$;

/* ---------- crear_materia_propia ---------- */

-- Crea la materia y sus correlativas en una sola transacción: si falla una correlativa no queda nada.
-- `materia` y `correlativas` usan las mismas claves que `materiasPropias` en reemplazar_datos_del_plan;
-- `requiere` es el uuid de una materia. El `orden` lo calcula la función, después de lo visible del plan.
--
-- Corre con los permisos del alumno: la RLS exige plan visible y dueño, y las correlativas las valida
-- correlativa_permitida, sin repetir las reglas acá.
--
-- Idempotente con el id del cliente. Si ya es una materia propia, la devuelve sin tocarla, aunque el
-- reintento traiga otros datos. Si es de otro, falla con un mensaje que no dice nada de esa materia.
create function public.crear_materia_propia(
  id uuid,
  plan_id uuid,
  materia jsonb,
  correlativas jsonb default '[]'
)
returns public.materias
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_materia public.materias;
begin
  if v_uid is null then
    raise exception 'hace falta una sesión' using errcode = '42501';
  end if;

  if jsonb_typeof(crear_materia_propia.correlativas) is distinct from 'array' then
    raise exception 'correlativas debe ser una lista' using errcode = '22023';
  end if;

  insert into public.materias as m
    (id, plan_id, owner_id, codigo, nombre, anio, cuatrimestre, tipo, area, requiere_anio_completo_para_cursar, orden)
  values (
    crear_materia_propia.id,
    crear_materia_propia.plan_id,
    v_uid,
    crear_materia_propia.materia ->> 'codigo',
    crear_materia_propia.materia ->> 'nombre',
    (crear_materia_propia.materia ->> 'anio')::integer,
    (crear_materia_propia.materia ->> 'cuatrimestre')::integer,
    coalesce(crear_materia_propia.materia ->> 'tipo', 'Materia'),
    crear_materia_propia.materia ->> 'area',
    (crear_materia_propia.materia ->> 'requiereAnioCompletoParaCursar')::integer,
    (select coalesce(max(o.orden), 0) + 1 from public.materias o where o.plan_id = crear_materia_propia.plan_id)
  )
  on conflict (id) do nothing
  returning m.* into v_materia;

  if not found then
    select m.* into v_materia
    from public.materias m
    where m.id = crear_materia_propia.id and m.owner_id = v_uid;

    if not found then
      raise exception 'no se pudo crear la materia con ese id' using errcode = '42501';
    end if;

    return v_materia;
  end if;

  insert into public.correlativas (materia_id, requiere_id, para, condicion)
  select v_materia.id, (c ->> 'requiere')::uuid, c ->> 'para', c ->> 'condicion'
  from jsonb_array_elements(crear_materia_propia.correlativas) c;

  return v_materia;
end;
$$;

/* ---------- reemplazar_datos_del_plan ---------- */

-- Aplica un `DatosImportados` (packages/core/src/tipos.ts). Una llamada es una transacción: cualquier
-- error deja todo como estaba. Corre con los permisos del alumno, así que la RLS sigue valiendo.
--
-- - Materias propias: se reutiliza la del alumno en ese plan con el mismo código o, sin código, con
--   el mismo nombre; si no hay, se crea. Lo que trae el archivo manda, incluidas sus correlativas.
--   Las que no vienen en el archivo se conservan.
-- - Cada materia existente se reutiliza para una sola clave: dos claves que coinciden no se fusionan,
--   la segunda crea otra materia. El orden de desempate hace que reimportar el mismo archivo le
--   devuelva a cada clave su materia, porque las creadas en una misma importación tienen igual fecha.
-- - `progreso` e `historial` del alumno en ese plan se borran y se reinsertan.
-- - v_mapa traduce cada referencia del archivo (clave o uuid) al uuid de la materia.
-- - Devuelve { clave: uuid } de las materias propias del archivo.
create function public.reemplazar_datos_del_plan(plan_id uuid, datos jsonb)
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
  v_historial jsonb := reemplazar_datos_del_plan.datos -> 'historial';
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
    or jsonb_typeof(v_progreso) is distinct from 'array'
    or jsonb_typeof(v_historial) is distinct from 'array' then
    raise exception 'datos debe tener materiasPropias, progreso e historial como listas'
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
    select h ->> 'materiaId' from jsonb_array_elements(v_historial) h
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

  delete from public.historial h
  using public.materias m
  where h.materia_id = m.id and m.plan_id = v_plan and h.user_id = v_uid;

  insert into public.progreso
    (user_id, materia_id, estado, p1, p2, rec, nota_cursada, nota_final_examen, nota, aplazos)
  select
    v_uid,
    (v_mapa ->> (f ->> 'materiaId'))::uuid,
    f ->> 'estado',
    (f ->> 'p1')::numeric,
    (f ->> 'p2')::numeric,
    (f ->> 'rec')::numeric,
    (f ->> 'notaCursada')::numeric,
    (f ->> 'notaFinalExamen')::numeric,
    (f ->> 'nota')::numeric,
    array(
      select a.valor::numeric
      from jsonb_array_elements_text(
        case when jsonb_typeof(f -> 'aplazos') = 'array' then f -> 'aplazos' else '[]'::jsonb end
      ) with ordinality as a (valor, posicion)
      order by a.posicion
    )
  from jsonb_array_elements(v_progreso) f;

  insert into public.historial (user_id, materia_id, fecha, tipo, nota, resultado, fuente)
  select
    v_uid,
    (v_mapa ->> (f ->> 'materiaId'))::uuid,
    (f ->> 'fecha')::date,
    f ->> 'tipo',
    (f ->> 'nota')::numeric,
    f ->> 'resultado',
    f ->> 'fuente'
  from jsonb_array_elements(v_historial) f;

  return v_claves;
end;
$$;
