-- Punto de partida cerrado, también en proyectos donde los defaults de Supabase ya otorgaron algo.
-- `anon` no recibe nada. `service_role` conserva acceso: lo usan procesos del servidor, nunca el cliente.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

/* ---------- Tablas: la RLS decide las filas ---------- */

grant select, insert, update, delete on
  public.universidades,
  public.carreras,
  public.planes,
  public.materias,
  public.correlativas,
  public.inscripciones,
  public.progreso,
  public.historial,
  public.materiales
to authenticated;

-- El alumno solo edita nombre y avatar; es_admin se cambia a mano desde el SQL Editor.
grant select on public.perfiles to authenticated;
grant update (nombre, avatar_url) on public.perfiles to authenticated;

grant select on public.documentos to authenticated;

grant select, insert on public.denuncias to authenticated;

/* ---------- Funciones: las que usan las políticas y las RPC ---------- */

-- Las funciones de trigger no van acá: Postgres no pide EXECUTE para disparar un trigger.
grant execute on function
  public.es_admin(),
  public.cursa_o_curso(uuid),
  public.plan_visible(uuid),
  public.plan_editable(uuid),
  public.materia_visible(uuid),
  public.materia_editable(uuid),
  public.correlativa_permitida(uuid, uuid),
  public.puede_registrar_progreso(uuid),
  public.material_visible(uuid),
  public.documento_propio(uuid),
  public.registrar_documento(text, text, bigint, integer, text),
  public.material_compartido(uuid),
  public.activar_plan(uuid),
  public.reemplazar_datos_del_plan(uuid, jsonb)
to authenticated;
