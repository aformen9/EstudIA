-- Acento y modo claro/oscuro del alumno, para que viajen entre dispositivos (decisión del 2026-11-16).
-- null: todavía no eligió nada; la app sube lo que tenga en el dispositivo. Los valores válidos son
-- los de packages/core (preferencias.ts).

alter table public.perfiles
  add column acento text constraint perfiles_acento_valido
    check (acento in ('azul', 'rosa', 'violeta', 'verde', 'naranja')),
  add column tema text constraint perfiles_tema_valido
    check (tema in ('light', 'dark'));

-- Cada uno edita solo su fila (política perfiles_update) y, de ella, solo estas columnas: es_admin
-- sigue cerrada.
grant update (acento, tema) on public.perfiles to authenticated;
