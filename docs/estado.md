# Estado del proyecto

Última actualización: 2026-11-07. Para retomar alcanza con este archivo y `git log`; las reglas de trabajo están en `CLAUDE.md`.

## Dónde quedó

- **Fase 0, sin cerrar.** Están hechas `db`, `core`, el CI y las 4 tandas de `web`. Falta lo de "Próximos pasos": vincular el remoto, probar con Google real, deploy, documentación y revisión final.
- **El repo está en `/Users/aformen9/Dev/EstudIA`.** Abrir la sesión nueva desde esa carpeta: desde ahí se cargan los agentes de `.claude/agents/`.
- **`main` está pusheado.** Resultado del CI: ver "Última verificación".
- **Supabase remoto:** proyecto y login con Google creados por Agu, **sin vincular y sin migraciones**. Ver el paso 1.
- **Migraciones:** se editaron en el lugar porque nunca se aplicaron en remoto. Desde que se suban, cualquier cambio va en una migración nueva.
- **Entorno local:** `pnpm dev` está frenado. Supabase local y Docker quedaron corriendo, con la base recién reseteada y sin usuarios. Para probar:
  - Docker abierto, `supabase start` y `pnpm dev` desde la carpeta del repo.
  - Abrir `http://localhost:5173` y tocar "Entrar con el usuario de prueba".
  - Importar `fixtures/caso-prueba-legacy.json` (alumno inventado): Inicio da 26 de 50 y promedio 7,73.

## Última verificación

Local, sobre el árbol que se commiteó:

| Qué | Resultado |
|---|---|
| `pnpm lint` y `pnpm typecheck` | pasan |
| `pnpm test` | `core` 247, `web` 449 |
| `pnpm build` | pasa; sin login de prueba ni enlaces a Google Fonts en `dist` |
| `supabase test db` (pgTAP) | 783 en 11 archivos |
| `pnpm --filter web test:integracion` | 22, contra la base local |
| Seed contra el catálogo | coincide; se comprobó que el chequeo falla con una diferencia |

En Chrome headless, con mouse simulado:

- Inicio, panel, materias propias, ciclos, Materiales, Ajustes, cerrar sesión, mover y agregar material, Deshacer y restaurar durante Deshacer, a 390 y 1280 px.
- Botón Atrás con un borrado pendiente. Encontró un bug, ya arreglado: al volver de la caché del navegador se borraba sin poder deshacer. Ahora salir de la página cancela el borrado.

**CI:** verde en `337f8f3` (corrida 42395248359), con los 3 jobs: calidad, RLS y claves en el historial. El paso "El seed coincide con el catálogo" corrió y pasó en GitHub. Después de ese commit solo cambió este archivo.

## Sin probar

- Google real y Supabase remoto (GRANT, `anon`, tope de tamaño del gateway para 2 MB de texto y `statement_timeout`).
- Táctil real, Safari, y `prefers-reduced-motion` en un dispositivo.
- Abrir un PDF en pestaña y la descarga real de archivos, arrastrar archivos, confeti y el aviso nativo de `beforeunload`.
- La vuelta del foco con teclado físico. El avatar con una foto real de Google.
- El brillo se midió con mouse simulado. Agu lo probó a mano y dijo que quedó bien.

## Próximos pasos

1. **Vincular el remoto (lo hace Agu):** primero apagar en el panel el login por mail; después correr `supabase link` con la contraseña de la base. Subir las migraciones y repetir contra el remoto la prueba de GRANT y de `anon` con la API real. Comprobar que un pedido de 2 MB de texto pase por el gateway.
2. **Criterio 5 con Google real:** entrar, elegir UCA / LCD / 7023, importar el caso de prueba, Inicio con 26 de 50 y 7,73, cambiar una nota y recargar, modo oscuro y 390 px, con capturas.
3. **Deploy en Vercel:** requiere conectar el proyecto al repo. Si se agrega una CSP, tiene que permitir el host de las fotos de Google en `img-src`.
4. **Documentación:** README y comandos en `CLAUDE.md`, incluido `pnpm --filter web test:integracion` con `supabase db reset` antes y después (borra los datos locales).
5. **Revisión final:** agente `revisor` y reporte ✅/❌ de cada criterio de `docs/fases/fase-0.md`. Esperar la aprobación de Agu antes de pasar de fase.

## Criterios de la fase 0

| # | Criterio | Estado |
|---|---|---|
| 1 | test, lint, typecheck y build | Pasa en local y en CI |
| 2 | `core` contra el fixture esperado | Pasa |
| 3 | `supabase db reset` con migraciones y seed | Pasa en local; falta en remoto |
| 4 | Tests de RLS | Pasa en local y CI; falta repetir GRANT y `anon` en remoto |
| 5 | Flujo manual con Google | **Falta:** probado con el login de prueba, no con Google |
| 6 | Sin claves reales, gitleaks en CI | Pasa en CI |
| 7 | Logo aprobado | Aprobado en `docs/decisiones.md` |

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
