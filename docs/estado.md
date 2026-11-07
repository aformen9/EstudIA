# Estado del proyecto

Última actualización: 2026-11-07. Para retomar alcanza con este archivo y `git log`; las reglas de trabajo están en `CLAUDE.md`.

## Dónde quedó

- **Fase 0, sin cerrar.** Están hechas `db`, `core`, el CI y las 4 tandas de `web`. Agu probó a mano en Safari y pidió cambios de diseño (`docs/decisiones.md`, 2026-11-07, y `docs/fases/fase-0.md` §0.6). Aprobó la primera versión de los mockups con ajustes y sumó la vista previa de archivos y un onboarding nuevo: **implementados en la rama `fase-0/cambios-de-diseno`, sin pushear y esperando la prueba de Agu**. Después sigue lo de "Próximos pasos": vincular el remoto, probar con Google real, deploy, documentación y revisión final.
- **El repo está en `/Users/aformen9/Dev/EstudIA`.** Abrir la sesión nueva desde esa carpeta: desde ahí se cargan los agentes de `.claude/agents/`.
- **`main` está pusheado.** Resultado del CI: ver "Última verificación".
- **Supabase remoto:** proyecto y login con Google creados por Agu, **sin vincular y sin migraciones**. Ver el paso 1.
- **Migraciones:** se editaron en el lugar porque nunca se aplicaron en remoto. Desde que se suban, cualquier cambio va en una migración nueva.
- **Entorno local:** la base local se reseteó el 2026-11-07 para aplicar `instancias`. El usuario de prueba quedó con el plan 7023 activo y el fixture importado (26 de 50, promedio 7,73), listo para probar. Para probar:
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

## Prueba manual de Agu en Safari (2026-11-07)

Funcionan bien: brillo, guardar y recargar, confeti, PDFs, Deshacer, modo oscuro y la vista Promedio.

## Cambios de diseño (rama `fase-0/cambios-de-diseno`)

- **Hecho:** todo lo de `docs/fases/fase-0.md` §0.6, en 6 commits sobre `main`. Solo el último deja todo en verde: los intermedios de `core` y de `web` no compilan por separado.
- **Verificado en local:** lint, typecheck, `core` 276 tests, `web` 461 tests, `supabase test db` 784 y `pnpm build`. PDF.js queda en un chunk aparte (148 kB con gzip, más el worker), fuera de la carga inicial.
- **Visto en Chrome (local, 1280 y 390 px):** subir con el selector nuevo, vista previa de un PDF real, de una imagen y de texto, tarjeta con dos materias, aviso de borrado, slider con arrastre de mouse y escribiendo, celebración y Promedio.
- **No visto en la app real:** el onboarding nuevo, porque el usuario de prueba ya tenía plan y no se pudo desactivar desde acá. Está cubierto por tests y por el mockup.
- **Panel por instancias (pedido después):** hecho. `historial` y las notas fijas de `progreso` se reemplazaron por la tabla `instancias` y la RPC `guardar_materia`. El fixture y los resultados esperados no cambiaron: el criterio 2 pasa igual, y el criterio 5 por la interfaz da 26 de 50 y 7,73.
- **Verificado (2026-11-07):** lint, typecheck, `core` 282, `web` 467, integración 22, `supabase test db` 796 y build. En Chrome, a 1280 y 390 px: onboarding real (con el plan elegido solo), importar el fixture, el panel de Cálculo Avanzado (recursada: nota 7, cursada vigente 8), Probabilidad (6 con aplazo 2), agregar instancias, agrupar y Falta final.
- **Falta:** que Agu lo pruebe en Safari antes del merge, en especial el blur, el slider con el dedo, el selector de fecha y la miniatura de HEIC. Agu no contó cómo le fue con el slider en el mockup.

## Sin probar

- Google real y Supabase remoto (GRANT, `anon`, tope de tamaño del gateway para 2 MB de texto y `statement_timeout`).
- Táctil real y `prefers-reduced-motion` en un dispositivo.
- La descarga real de archivos que no se abren en pestaña, arrastrar archivos y el aviso nativo de `beforeunload`.
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
