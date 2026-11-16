-- Verificación del proyecto remoto, SOLO LECTURA.
--
-- Comprueba lo mismo que supabase/tests/01_privilegios_y_seed.test.sql y 08_grants.test.sql, sin
-- pgTAP y sin crear nada: es una sola consulta (un SELECT con CTE). Se pega entera en el SQL Editor
-- del panel de Supabase. Devuelve una fila por comprobación: "ok" o la lista de lo que no coincide.
--
-- Lo que no cubre (necesita escribir o cambiar de rol, y eso lo hacen los tests pgTAP en local y en
-- el CI): los throws_ok que entran como anon o authenticated, y que una tabla creada después no
-- quede expuesta. Acá se mira en su lugar la configuración de privilegios por defecto.
--
-- Si cambian las migraciones o el seed, actualizar este archivo junto con 01 y 08.

with
-- Objetos de public que son de la app (las funciones de extensiones quedan afuera).
tablas as (
  select c.oid, c.relname::text as nombre, c.relkind, c.relrowsecurity, c.relacl
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
),
funciones as (
  select p.oid, p.proname::text as nombre, p.prosecdef, p.proconfig, p.proacl, p.prorettype
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
secuencias as (
  select c.oid, c.relname::text as nombre
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'S'
),
catalogo as (
  select m.* from public.materias m join public.planes p on p.id = m.plan_id
  where p.version = '7023' and m.owner_id is null
),

-- Privilegios de tabla de un rol, en el formato de 08: "tabla: DELETE,INSERT,..."
privilegios_authenticated as (
  select t.nombre || ': ' || string_agg(p, ',' order by p collate "C") as x
  from tablas t
  cross join unnest(array['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']) p
  where has_table_privilege('authenticated', t.oid, p)
  group by t.nombre
),

-- Compara una lista real con la esperada y devuelve "ok" o lo que falta y lo que sobra.
-- (Se arma con arrays para no repetir la lógica en cada fila.)
listas (chequeo, real, esperado) as (
  values
  ('tablas de public (§4)',
   (select array_agg(nombre order by nombre collate "C") from tablas where relkind = 'r'),
   array['carreras', 'correlativas', 'denuncias', 'documentos', 'inscripciones', 'instancias',
         'limites_documentos', 'materiales', 'materias', 'perfiles', 'planes', 'progreso',
         'reportes', 'universidades', 'uso_documentos']),

  ('GRANT de authenticated sobre tablas',
   (select array_agg(x order by x collate "C") from privilegios_authenticated),
   array['carreras: DELETE,INSERT,SELECT,UPDATE',
         'correlativas: DELETE,INSERT,SELECT,UPDATE',
         'denuncias: INSERT,SELECT',
         'documentos: SELECT',
         'inscripciones: DELETE,INSERT,SELECT,UPDATE',
         'instancias: DELETE,INSERT,SELECT,UPDATE',
         'materiales: DELETE,INSERT,SELECT,UPDATE',
         'materias: DELETE,INSERT,SELECT,UPDATE',
         'perfiles: SELECT',
         'planes: DELETE,INSERT,SELECT,UPDATE',
         'progreso: DELETE,INSERT,SELECT,UPDATE',
         'universidades: DELETE,INSERT,SELECT,UPDATE']),

  ('perfiles: authenticated actualiza solo nombre, avatar_url, acento y tema',
   (select array_agg(a.attname::text order by a.attname::text collate "C")
    from pg_attribute a
    where a.attrelid = 'public.perfiles'::regclass and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')),
   array['acento', 'avatar_url', 'nombre', 'tema']),

  ('GRANT por columna (authenticated y PUBLIC)',
   (select array_agg(x order by x collate "C") from (
      select t.nombre || '.' || a.attname || ': ' || acl.privilege_type as x
      from tablas t
      join pg_attribute a on a.attrelid = t.oid
      cross join lateral aclexplode(a.attacl) acl
      where a.attnum > 0 and not a.attisdropped
        and acl.grantee in ('authenticated'::regrole::oid, 0)) c),
   array['perfiles.acento: UPDATE', 'perfiles.avatar_url: UPDATE', 'perfiles.nombre: UPDATE',
         'perfiles.tema: UPDATE', 'reportes.contactable: INSERT', 'reportes.navegador: INSERT',
         'reportes.sistema: INSERT', 'reportes.texto: INSERT', 'reportes.tipo: INSERT',
         'reportes.version_app: INSERT', 'reportes.vista: INSERT']),

  ('funciones que ejecuta authenticated',
   (select array_agg(nombre order by nombre collate "C") from funciones
    where has_function_privilege('authenticated', oid, 'EXECUTE')),
   array['activar_plan', 'correlativa_permitida', 'crear_materia_propia', 'cursa_o_curso',
         'documento_propio', 'es_admin', 'guardar_materia', 'materia_editable', 'materia_visible',
         'material_compartido', 'material_visible', 'metricas_admin', 'plan_editable', 'plan_visible',
         'puede_registrar_en_materia', 'reemplazar_datos_del_plan', 'registrar_documento',
         'reportes_admin']),

  ('funciones que authenticated NO ejecuta (triggers y columna generada)',
   (select array_agg(nombre order by nombre collate "C") from funciones
    where not has_function_privilege('authenticated', oid, 'EXECUTE')),
   array['crear_perfil', 'documento_texto_tsv', 'materia_normalizar_codigo',
         'materia_proteger_datos_de_alumnos', 'materia_proteger_dueno_y_plan',
         'material_cambio_de_materia_a_privado', 'material_fijar_compartido_en',
         'material_proteger_autor', 'material_proteger_oculto', 'material_sin_fecha_futura',
         'ocultar_material_denunciado', 'plan_proteger_materias_propias', 'poner_updated_at',
         'reportes_antes_de_insertar'])
),
comparaciones as (
  select chequeo,
    case
      when coalesce(real, '{}') = esperado then 'ok'
      else concat_ws(' | ',
        'faltan: ' || nullif(array_to_string(array(select unnest(esperado) except select unnest(coalesce(real, '{}'))), ', '), ''),
        'sobran: ' || nullif(array_to_string(array(select unnest(coalesce(real, '{}')) except select unnest(esperado)), ', '), ''))
    end as resultado
  from listas
),

-- Comprobaciones que esperan "ninguno": devuelven la lista de lo que aparece.
vacios (chequeo, encontrados) as (
  values
  ('RLS activada en todas las tablas',
   (select string_agg(nombre, ', ' order by nombre) from tablas where relkind = 'r' and not relrowsecurity)),

  ('security definer con search_path vacío',
   (select string_agg(nombre, ', ' order by nombre) from funciones
    where prosecdef and not ('search_path=""' = any (coalesce(proconfig, '{}'))))),

  ('anon: ningún privilegio sobre tablas ni columnas',
   (select string_agg(nombre, ', ' order by nombre) from tablas
    where has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_any_column_privilege('anon', oid, 'SELECT,INSERT,UPDATE,REFERENCES'))),

  ('anon: no ejecuta ninguna función',
   (select string_agg(nombre, ', ' order by nombre) from funciones
    where has_function_privilege('anon', oid, 'EXECUTE'))),

  ('anon y authenticated: ninguna secuencia',
   (select string_agg(nombre, ', ' order by nombre) from secuencias
    where has_sequence_privilege('anon', oid, 'USAGE,SELECT,UPDATE')
       or has_sequence_privilege('authenticated', oid, 'USAGE,SELECT,UPDATE'))),

  ('PUBLIC: ninguna tabla con GRANT',
   (select string_agg(t.nombre || ': ' || acl.privilege_type, ', ' order by t.nombre)
    from tablas t cross join lateral aclexplode(t.relacl) acl where acl.grantee = 0)),

  ('PUBLIC: ninguna función abierta',
   (select string_agg(nombre, ', ' order by nombre) from funciones
    where proacl is null or exists (select 1 from aclexplode(proacl) a where a.grantee = 0))),

  ('authenticated: no ejecuta funciones de trigger',
   (select string_agg(nombre, ', ' order by nombre) from funciones
    where prorettype = 'trigger'::regtype and has_function_privilege('authenticated', oid, 'EXECUTE'))),

  ('limites_documentos y uso_documentos: sin acceso para anon ni authenticated',
   (select string_agg(r || ' en ' || t, ', ')
    from unnest(array['authenticated', 'anon']) r
    cross join unnest(array['public.limites_documentos', 'public.uso_documentos']) t
    where has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_any_column_privilege(r, t, 'SELECT,INSERT,UPDATE,REFERENCES'))),

  ('service_role: lee y escribe todas las tablas',
   (select string_agg(t.nombre || ': ' || p, ', ' order by t.nombre)
    from tablas t cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
    where t.relkind = 'r' and not has_table_privilege('service_role', t.oid, p))),

  ('service_role: ejecuta todas las funciones',
   (select string_agg(nombre, ', ' order by nombre) from funciones
    where not has_function_privilege('service_role', oid, 'EXECUTE'))),

  ('privilegios por defecto de postgres en public: nada para anon ni authenticated',
   (select string_agg(d.defaclobjtype::text || ' -> ' || a.grantee::regrole::text || ': ' || a.privilege_type, ', ')
    from pg_default_acl d
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and (d.defaclnamespace = 'public'::regnamespace or d.defaclnamespace = 0)
      and a.grantee in ('anon'::regrole, 'authenticated'::regrole)))
),

-- Seed: valor real contra el esperado.
seed (chequeo, real, esperado) as (
  values
  ('seed: universidad UCA Rosario publicada',
   (select count(*)::text from public.universidades where sigla = 'UCA' and sede = 'Rosario' and estado = 'publicado'), '1'),
  ('seed: carrera LCD publicada',
   (select count(*)::text from public.carreras where sigla = 'LCD' and estado = 'publicado'), '1'),
  ('seed: plan 7023 publicado',
   (select count(*)::text from public.planes where version = '7023' and estado = 'publicado'), '1'),
  ('seed: escala del plan (mín, máx, aprobación, paso, cuatrimestres)',
   (select concat_ws(', ', nota_min, nota_max, nota_aprobacion, nota_paso, cuatrimestres_por_anio)
    from public.planes where version = '7023'), '1, 10, 4, 0.1, 2'),
  ('seed: cierre de cuatrimestres',
   (select cierre_cuatrimestres::text from public.planes where version = '7023'),
   '[{"mes": 7, "cuatrimestre": 1}, {"mes": 12, "cuatrimestre": 2}]'),
  ('seed: 50 materias del catálogo',
   (select count(*)::text from catalogo), '50'),
  ('seed: 88 correlativas',
   (select count(*)::text from public.correlativas where materia_id in (select id from catalogo)), '88'),
  ('seed: 47 para cursar (regular) y 41 para rendir (aprobada)',
   (select concat_ws(', ',
      count(*) filter (where para = 'cursar' and condicion = 'regular'),
      count(*) filter (where para = 'rendir' and condicion = 'aprobada'))
    from public.correlativas where materia_id in (select id from catalogo)), '47, 41'),
  ('seed: regla de 2° año completo en 14 materias, todas de 4° año',
   (select concat_ws(', ',
      count(*) filter (where requiere_anio_completo_para_cursar = 2),
      count(*) filter (where requiere_anio_completo_para_cursar = 2 and anio <> 4))
    from catalogo), '14, 0'),
  ('seed: todas con código y orden propio (1 a 50)',
   (select concat_ws(', ', count(*) filter (where codigo is null), count(distinct orden), min(orden))
    from catalogo), '0, 50, 1')
)

select chequeo, resultado from comparaciones
union all
select chequeo, coalesce('NO: ' || encontrados, 'ok') from vacios
union all
select chequeo, case when real is not distinct from esperado then 'ok' else 'NO: da ' || coalesce(real, 'null') || ', se esperaba ' || esperado end
from seed;
