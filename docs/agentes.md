# Trabajo con subagentes

La sesión principal de Claude Code es la **coordinadora**: habla con Agu, propone el plan de la fase, reparte el trabajo y lo integra. Los subagentes (definidos en `.claude/agents/`) trabajan cada uno en **su carpeta**, así no se pisan.

## Agentes

| Agente | Carpeta que puede modificar | Hace |
|---|---|---|
| `db` | `supabase/`, `scripts/generar-seed.ts` | migraciones, RLS, RPCs, seed, tests pgTAP |
| `core` | `packages/core/` | tipos, lógica de dominio, importadores, herramientas IA, tests |
| `web` | `apps/web/` | UI React, portado de estética/vistas, integración con Supabase |
| `revisor` | ninguna (solo lectura) | revisión independiente al final de cada fase: criterios de aceptación, seguridad, RLS, consistencia con la arquitectura |

Archivos compartidos (raíz del repo, `package.json` raíz, CI, `docs/`): **solo la coordinadora**.

## Reglas para todos los agentes

- Leer `CLAUDE.md`, `docs/arquitectura.md` y la fase actual antes de empezar.
- No tocar carpetas ajenas. Si necesitan un cambio en otra carpeta (ej. `web` necesita un tipo nuevo en `core`), **lo piden a la coordinadora** en su reporte; no lo hacen.
- Ante una decisión de diseño grande o una duda, **no la resuelven**: la devuelven a la coordinadora, que le pregunta a Agu.
- Terminan con un reporte: qué hicieron, archivos tocados, tests corridos y resultado, dudas abiertas.

## Orden típico de una fase

1. **Coordinadora**: propone el plan de la fase a Agu → espera "dale".
2. **Coordinadora**: scaffold y **contratos** (tipos en `packages/core/src/tipos.ts`, firmas de funciones, esquema de tablas acordado). Los contratos van primero porque son lo que comparten los agentes.
3. **En paralelo**: `db` y `core`.
4. **Después**: `web` (depende de los dos anteriores).
5. **Coordinadora**: integración, CI, verificación de criterios de aceptación.
6. **`revisor`**: revisión independiente (no vio el trabajo mientras se hacía). La coordinadora corrige lo que encuentre o lo consulta con Agu.
7. **Coordinadora**: reporte final a Agu con ✅/❌ por criterio → espera aprobación.

## Fase 0 en concreto

- Paso 2: scaffold pnpm + `supabase init` + `tipos.ts` + interfaz `Repositorio` (métodos que la web usará contra Supabase).
- Paso 3: `db` (migraciones de §4–§5, seed desde `fixtures/lcd-7023-catalogo.json`, tests RLS) ‖ `core` (cálculo §6 + importador legacy + tests contra `fixtures/caso-prueba-esperado.json`).
- Paso 4: `web` (porta `referencia/mi-plan-de-estudio/` a React sobre `core` + Supabase). El logo: proponer opciones y que la coordinadora le pregunte a Agu.
