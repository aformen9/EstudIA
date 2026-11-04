-- Políticas de docs/arquitectura.md §5. Sin política para `anon`: no accede a nada.

alter table public.universidades enable row level security;
alter table public.carreras enable row level security;
alter table public.planes enable row level security;
alter table public.materias enable row level security;
alter table public.correlativas enable row level security;
alter table public.perfiles enable row level security;
alter table public.inscripciones enable row level security;
alter table public.progreso enable row level security;
alter table public.historial enable row level security;
alter table public.documentos enable row level security;
alter table public.materiales enable row level security;
alter table public.denuncias enable row level security;

/* ---------- universidades ---------- */

create policy universidades_select on public.universidades for select to authenticated
  using (estado = 'publicado' or creado_por = (select auth.uid()) or (select public.es_admin()));

create policy universidades_insert on public.universidades for insert to authenticated
  with check ((select public.es_admin()) or (estado = 'pendiente' and creado_por = (select auth.uid())));

create policy universidades_update on public.universidades for update to authenticated
  using ((select public.es_admin()) or (estado = 'pendiente' and creado_por = (select auth.uid())))
  with check ((select public.es_admin()) or (estado = 'pendiente' and creado_por = (select auth.uid())));

create policy universidades_delete on public.universidades for delete to authenticated
  using ((select public.es_admin()) or (estado = 'pendiente' and creado_por = (select auth.uid())));

/* ---------- carreras ---------- */

create policy carreras_select on public.carreras for select to authenticated
  using (estado = 'publicado' or creado_por = (select auth.uid()) or (select public.es_admin()));

create policy carreras_insert on public.carreras for insert to authenticated
  with check ((select public.es_admin()) or (estado = 'pendiente' and creado_por = (select auth.uid())));

create policy carreras_update on public.carreras for update to authenticated
  using ((select public.es_admin()) or (estado = 'pendiente' and creado_por = (select auth.uid())))
  with check ((select public.es_admin()) or (estado = 'pendiente' and creado_por = (select auth.uid())));

create policy carreras_delete on public.carreras for delete to authenticated
  using ((select public.es_admin()) or (estado = 'pendiente' and creado_por = (select auth.uid())));

/* ---------- planes ---------- */

create policy planes_select on public.planes for select to authenticated
  using (estado = 'publicado' or creado_por = (select auth.uid()) or (select public.es_admin()));

create policy planes_insert on public.planes for insert to authenticated
  with check ((select public.es_admin()) or (estado = 'pendiente' and creado_por = (select auth.uid())));

create policy planes_update on public.planes for update to authenticated
  using ((select public.es_admin()) or (estado = 'pendiente' and creado_por = (select auth.uid())))
  with check ((select public.es_admin()) or (estado = 'pendiente' and creado_por = (select auth.uid())));

create policy planes_delete on public.planes for delete to authenticated
  using ((select public.es_admin()) or (estado = 'pendiente' and creado_por = (select auth.uid())));

/* ---------- materias ---------- */

create policy materias_select on public.materias for select to authenticated
  using (public.plan_visible(plan_id) and (owner_id is null or owner_id = (select auth.uid())));

create policy materias_insert on public.materias for insert to authenticated
  with check (
    (owner_id = (select auth.uid()) and public.plan_visible(plan_id))
    or (owner_id is null and public.plan_editable(plan_id))
  );

create policy materias_update on public.materias for update to authenticated
  using (owner_id = (select auth.uid()) or (owner_id is null and public.plan_editable(plan_id)))
  with check (
    (owner_id = (select auth.uid()) and public.plan_visible(plan_id))
    or (owner_id is null and public.plan_editable(plan_id))
  );

create policy materias_delete on public.materias for delete to authenticated
  using (owner_id = (select auth.uid()) or (owner_id is null and public.plan_editable(plan_id)));

/* ---------- correlativas ---------- */

create policy correlativas_select on public.correlativas for select to authenticated
  using (public.materia_visible(materia_id));

create policy correlativas_insert on public.correlativas for insert to authenticated
  with check (public.correlativa_permitida(materia_id, requiere_id));

create policy correlativas_update on public.correlativas for update to authenticated
  using (public.materia_editable(materia_id))
  with check (public.correlativa_permitida(materia_id, requiere_id));

create policy correlativas_delete on public.correlativas for delete to authenticated
  using (public.materia_editable(materia_id));

/* ---------- perfiles: las columnas editables se limitan con grants ---------- */

create policy perfiles_select on public.perfiles for select to authenticated
  using (id = (select auth.uid()) or (select public.es_admin()));

create policy perfiles_update on public.perfiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

/* ---------- inscripciones ---------- */

create policy inscripciones_select on public.inscripciones for select to authenticated
  using (user_id = (select auth.uid()));

create policy inscripciones_insert on public.inscripciones for insert to authenticated
  with check (user_id = (select auth.uid()) and public.plan_visible(plan_id));

create policy inscripciones_update on public.inscripciones for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.plan_visible(plan_id));

create policy inscripciones_delete on public.inscripciones for delete to authenticated
  using (user_id = (select auth.uid()));

/* ---------- progreso ---------- */

create policy progreso_select on public.progreso for select to authenticated
  using (user_id = (select auth.uid()));

create policy progreso_insert on public.progreso for insert to authenticated
  with check (user_id = (select auth.uid()) and public.puede_registrar_en_materia(materia_id));

create policy progreso_update on public.progreso for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.puede_registrar_en_materia(materia_id));

create policy progreso_delete on public.progreso for delete to authenticated
  using (user_id = (select auth.uid()));

/* ---------- historial ---------- */

create policy historial_select on public.historial for select to authenticated
  using (user_id = (select auth.uid()));

create policy historial_insert on public.historial for insert to authenticated
  with check (user_id = (select auth.uid()) and public.puede_registrar_en_materia(materia_id));

create policy historial_update on public.historial for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.puede_registrar_en_materia(materia_id));

create policy historial_delete on public.historial for delete to authenticated
  using (user_id = (select auth.uid()));

/* ---------- documentos: se escriben solo por registrar_documento ---------- */

create policy documentos_select on public.documentos for select to authenticated
  using (public.documento_propio(id));

/* ---------- materiales: `oculto` lo protege el trigger material_proteger_oculto ---------- */

create policy materiales_select on public.materiales for select to authenticated
  using (user_id = (select auth.uid()) or (select public.es_admin()));

create policy materiales_insert on public.materiales for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (materia_id is null or public.materia_visible(materia_id))
  );

create policy materiales_update on public.materiales for update to authenticated
  using (user_id = (select auth.uid()) or (select public.es_admin()))
  with check (
    (select public.es_admin())
    or (user_id = (select auth.uid()) and (materia_id is null or public.materia_visible(materia_id)))
  );

create policy materiales_delete on public.materiales for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.es_admin()));

/* ---------- denuncias ---------- */

create policy denuncias_select on public.denuncias for select to authenticated
  using (user_id = (select auth.uid()) or (select public.es_admin()));

create policy denuncias_insert on public.denuncias for insert to authenticated
  with check (user_id = (select auth.uid()) and public.material_visible(material_id));
