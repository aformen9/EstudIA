# Estado del proyecto

Última actualización: 2026-11-16. Para retomar alcanza con este archivo, `docs/backlog.md` y `git log`; las reglas de trabajo están en `CLAUDE.md`.

## Dónde quedó

- **Fase 0, sin cerrar y con el alcance congelado** (2026-11-16). Se cierra con los pasos de `docs/backlog.md` §1; ver "Próximos pasos".
- **Cambios de diseño mergeados:** PR #1 con squash, CI en verde. La rama `fase-0/cambios-de-diseno` está borrada.
- **Historial reescrito (2026-11-16):** se sacó `Co-Authored-By: Claude` de los 59 commits de `main` (solo cambiaron los mensajes y los hashes; los archivos son los mismos) y se hizo force push. Desde ahora Agu es el único autor (`CLAUDE.md`, regla 6). En la pestaña "Commits" del PR #1 GitHub conserva los commits originales.
- **El repo está en `/Users/aformen9/Dev/EstudIA`.** Abrir la sesión nueva desde esa carpeta: desde ahí se cargan los agentes de `.claude/agents/`.
- **Supabase remoto** (`uckdkqsdyindmyrvdccw`): vinculado por Agu con `supabase link`, con las migraciones y el seed subidos (`supabase db push --include-seed`). **Desde ahora, cualquier cambio a la base va en una migración nueva**: las originales ya no se editan.
- **Deploy en Vercel:** https://estudia-liard.vercel.app, hecho por Agu. Root Directory `apps/web`, preset Vite, con `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` del remoto, sin la integración de Supabase. La URL está en Supabase (Site URL y Redirect URLs) y en Google (orígenes autorizados).
- **Entorno local:** para probar contra la base local:
  - Docker abierto, `supabase start` y `pnpm dev` desde la carpeta del repo (`pnpm dev` usa `.env.development.local`, o sea la base local).
  - Abrir `http://localhost:5173` y tocar "Entrar con el usuario de prueba".
  - Importar `fixtures/caso-prueba-legacy.json` (alumno inventado): Inicio da 26 de 50 y promedio 7,73.

## Última verificación

Local, antes del PR #1 (2026-11-16):

| Qué | Resultado |
|---|---|
| `pnpm lint` y `pnpm typecheck` | pasan |
| `pnpm test` | `core` 282, `web` 467 |
| `pnpm build` | pasa |
| `supabase test db` y la integración | no se corrieron (Docker apagado); la última vez, el 2026-11-07: pgTAP 796, integración 22 |

**CI:** verde en el PR #1 (calidad, migraciones y RLS, claves en el historial) y en `main` después de reescribir el historial.

**Remoto, con la API real y sin sesión (2026-11-16):**

- `anon` no lee ni escribe ninguna de las 14 tablas y no ejecuta ninguna RPC (401, `42501`).
- Un pedido de 2 MB de texto pasa el gateway (sin 413; Postgres lo rechaza por permisos). Probado sin sesión.
- Login por mail apagado: comprobado en `/auth/v1/settings` (`email: false`, `google: true`).
- **GRANT, RLS, `security definer` y seed en el remoto:** `supabase test db --remote` falla antes de correr (ver `docs/backlog.md` §2) y se dejó de usar contra producción. Se verifican con `supabase/verificacion_remoto.sql` (una sola consulta de solo lectura para el SQL Editor; en local da 28 de 28 "ok" y detecta los errores a propósito). Falta que Agu la corra en el remoto.

## Prueba manual de Agu en Safari (2026-11-07)

Funcionan bien: brillo, guardar y recargar, confeti, PDFs, Deshacer, modo oscuro y la vista Promedio.

## Cambios de diseño (mergeados en el PR #1)

- **Hecho:** todo lo de `docs/fases/fase-0.md` §0.6 y el panel por instancias (`instancias` y la RPC `guardar_materia` en lugar de `historial` y las notas fijas).
- **Verificado (2026-11-07):** en Chrome, a 1280 y 390 px: onboarding real, importar el fixture, panel por instancias, vista previa de PDF, imagen y texto, tarjeta con dos materias, slider, celebración y Promedio.
- **Falta probar en Safari, sobre el deploy** (decidido el 2026-11-16: se mergeó antes): el blur, el slider con el dedo, el selector de fecha y la miniatura de HEIC.

## Sin probar

- `statement_timeout` con 2 MB de texto con sesión.
- Táctil real y `prefers-reduced-motion` en un dispositivo.
- La descarga real de archivos que no se abren en pestaña, arrastrar archivos y el aviso nativo de `beforeunload`.
- La vuelta del foco con teclado físico. El avatar con una foto real de Google.

## Próximos pasos (`docs/backlog.md` §1)

1. ~~Mergear la rama por PR con squash y CI en verde.~~ Hecho (PR #1).
2. **Remoto:** ~~`supabase link`, migraciones, seed y login por mail apagado~~ hecho. Falta: correr `supabase/verificacion_remoto.sql` en el SQL Editor (Agu).
3. ~~Deploy en Vercel y URL en Supabase y Google.~~ Hecho por Agu.
4. ~~**Criterio 5** con Google real sobre el deploy.~~ Verificado a mano por Agu el 2026-11-16, sin capturas. Falta confirmar en el deploy el arreglo del menú lateral.
5. **README real** con el crédito a "Mi Plan de Estudio", de Lucía Formenti, y los comandos en `CLAUDE.md`, incluido `pnpm --filter web test:integracion` con `supabase db reset` antes y después (borra los datos locales). Va en un PR.
6. **Revisión final:** agente `revisor` y reporte ✅/❌ de cada criterio de `docs/fases/fase-0.md`. Esperar la aprobación de Agu antes de pasar de fase.

## Criterios de la fase 0

| # | Criterio | Estado |
|---|---|---|
| 1 | test, lint, typecheck y build | Pasa en local y en CI |
| 2 | `core` contra el fixture esperado | Pasa |
| 3 | `supabase db reset` con migraciones y seed | Pasa en local; en remoto se subieron, falta `verificacion_remoto.sql` |
| 4 | Tests de RLS | Pasa en local y CI; en remoto `anon` pasa, faltan GRANT con `verificacion_remoto.sql` |
| 5 | Flujo manual con Google | ✅ Verificado manualmente por Agu en el deploy (2026-11-16), sin capturas |
| 6 | Sin claves reales, gitleaks en CI | Pasa en CI |
| 7 | Logo aprobado | Aprobado en `docs/decisiones.md` |
| 8 | Sin `<select>`; plan único salteado, más reciente preseleccionado | Pasa en tests; lo confirma el revisor |
| 9 | Vista previa y PDF.js fuera de la carga inicial | ✅ Aceptado por Agu: build y tests, más la prueba manual de la caché (el test automático va al backlog) |

## Peso del JS

Carga inicial: 545 kB (gzip 160 kB). Antes de esta tanda eran 700 kB (gzip 200 kB).

- **Qué ocupa:** `react-dom` unos 207 kB y Supabase unos 205 kB. Realtime y Storage (unos 80 kB) no se usan todavía, pero `supabase-js` los trae siempre.
- **Qué se sacó:** `zod` (unos 86 kB) ya no carga al entrar: va en `@estudia/core/importacion` y baja solo al importar o descargar un respaldo.
- **Decisión:** aceptado para la fase 0. Hay que revisarlo antes de publicar (`arquitectura.md` §12).

## Abierto para otras fases

En `docs/arquitectura.md` §12:

- **Fase 1:** M2, B2, B5, B6, texto falso en documentos, cuota que no vuelve y `extraido_con`. Las decisiones de importar de SIU están en `docs/investigacion/siu-guarani.md`: lo primero es que Agu baje sus archivos y revise la lista de pruebas, guardando los originales fuera del repo.
- **Fase 1b:** M3, B9 y republicar para quedar primero.
- **Riesgo aceptado:** B4.

## Efectos aceptados que conviene recordar

- Restaurar un respaldo: un material movido después reaparece en la materia vieja, y el de una materia propia borrada queda "sin materia" y también en la materia recreada (`arquitectura.md` §6).
- Salir de la página durante los 8 s de Deshacer cancela el borrado: el material sigue ahí.
- En el peor caso de 2 MB de texto, solo queda buscable un 25 %.
