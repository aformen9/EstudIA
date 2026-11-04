# Estado del proyecto

Última actualización: 2026-11-04. Para retomar alcanza con este archivo y `git log`; las reglas de trabajo están en `CLAUDE.md`.

## Dónde quedó

- **Fase 0, sin cerrar.** `db`, `core`, CI y las tandas 1 a 3 de `web` están hechas. **La tanda 4 de `web` no empezó:** se lanzó y se frenó antes de que tocara un archivo, porque Agu estaba por llegar al límite de uso. Se relanza con el pedido de abajo.
- **CI en verde hasta `3b60524`,** con los 3 jobs: calidad, RLS y claves. Esa corrida tardó unos 21 minutos. Lo que venga después de ese commit todavía no pasó por el CI: confirmá con `git status -sb`.
- **Última verificación, solo local:** lint y typecheck pasan; 171 tests de `core` y 249 de `web`. Los tests de integración (12) y pgTAP (443) pasaron por última vez en la tanda 3: después no cambió la base ni `web`.
- **Supabase remoto:** proyecto y login con Google creados por Agu, **sin vincular y sin migraciones**. No vincular ni migrar hasta el paso 3 de "Próximos pasos".
- **Supabase local:** puede haber quedado corriendo (`supabase status`). Si no, `supabase start`; requiere Docker.

## Tanda 4 de `web`: todo pendiente

Lanzar el agente `web` con este pedido. Solo modifica `apps/web/` y no commitea: commitea la coordinadora. Antes de lanzarlo, que lea `CLAUDE.md`, `docs/arquitectura.md`, `docs/fases/fase-0.md` (§0.4) y `docs/decisiones.md`. Se porta de `referencia/mi-plan-de-estudio/` (`openMateria` en `app.js`, Materiales, Ajustes). Tests y navegador solo contra el stack local. Sin dependencias nuevas.

### 1. Panel de materia

Reemplaza a `useAbrirMateria` y su aviso "Próximamente" (`apps/web/src/plan/abrirMateria.tsx`).

- Correlativas para cursar y rendir con su estado, estado, parciales, notas, aplazos, historial y material. Usa de `@estudia/core`: `sugerirEstado`, `alEditarNota`, `parsearAplazos`, `notasDeEscala`, `estadoCorrelativas`, `historialDeMateria`, `materialesDeMateria`, `esMateriaPropia`.
- Confeti al aprobar, respetando `prefers-reduced-motion`. Foco atrapado, Escape cierra y el foco vuelve a quien lo abrió. Sin scroll horizontal a 390 px.
- Notas: selector de enteros. Una nota guardada con decimales aparece como opción extra y se conserva; abrir y guardar sin tocar nada no la cambia (con test).
- Catálogo: nombre y correlativas de solo lectura.
- Materias propias: crear, editar nombre y correlativas, y borrar. Crear usa `normalizarBorrador(borrador, null)` con `tipo: "Materia"`. Editar usa `borradorDeMateria`, `opcionesDeCorrelativa` y `normalizarBorrador`.
- Correlativas: las ya marcadas conservan su condición; las nuevas usan `CONDICION_PREDETERMINADA`.
- Ciclos: antes de guardar, `cicloDeCorrelativas(datos, materiaId, borrador.correlativas)` con el borrador normalizado. Si devuelve ids, no guarda y nombra las materias del ciclo. Un ciclo importado impide guardar aunque solo cambie el nombre: el mensaje tiene que explicar cómo arreglarlo.
- Borrar: avisar la cantidad de materiales asociados y qué les pasa según la base. Verificar el comportamiento real.

### 2. Materiales

- Links y notas en la nube. Archivos locales (IndexedDB u OPFS, por `sha256`) registrados con `registrar_documento`, sin texto todavía. En otro dispositivo: "disponible en el dispositivo donde lo subiste (Drive llega en la fase 1)".
- Restauración de materiales de un respaldo, de punta a punta.
- Seguridad, con tests:
  - Links solo `http:` y `https:`, también si vienen de un respaldo, con `rel="noopener noreferrer"`.
  - Archivos locales separados por `user.id`, para que otra cuenta en el mismo navegador no los vea.
  - Un HTML o SVG subido no se ejecuta en el origen de la app: abrir solo tipos seguros (PDF, imágenes rasterizadas) y descargar el resto.
  - El `sha256` de documentos ajenos no se pide ni se muestra.
- Duda sin decidir, para Agu: ¿se borran los archivos locales al cerrar sesión? Hasta que decida, no se borran.

### 3. Ajustes (`#ajustes`)

Nombre, cambiar de carrera o plan, descargar respaldo (`crearRespaldo`; informar `materialesOmitidos` si hay), importar respaldo viejo y cerrar sesión (solo este dispositivo). El popover queda como atajo. Si la arquitectura no define qué pasa con los datos al cambiar de plan, no inventarlo: implementar el resto y preguntarle a Agu.

### 4. Fuentes en el repo

Bricolage Grotesque y Plus Jakarta Sans, con los pesos actuales. Sacar los `link` a Google de `apps/web/index.html`, con un test de que el build no referencia `fonts.googleapis` ni `fonts.gstatic`. Obtener los `woff2` con `npm pack` de los paquetes `@fontsource` en una carpeta temporal fuera del repo, sin correr scripts de instalación. Copiar solo los `woff2` y la licencia OFL a `apps/web/public/fonts/`. Sin cambios en `package.json`.

### 5. Decisiones de la tanda 3

- **Materiales del plan:** Inicio (`vistas/Inicio.tsx`), el contador (`interfaz/Shell.tsx`) y la vista Materiales usan `materialesDelPlan`. Se va la rama "De otro plan". Al subir un material, la materia se elige entre las del plan activo.
- **`beforeunload`:** recargar o cerrar la pestaña con filas que fallaron muestra el aviso nativo, en cualquier vista. Sin filas fallidas no se registra. Salir por el menú no avisa.
- **Timeout del guardado:** nunca queda en "Terminando de guardar…". Al vencer pasa a "No se pudo guardar", con reintentar. Tests: guardado colgado en grilla y panel; una respuesta tardía no pisa un valor más nuevo ni marca "Guardado"; reintentar es idempotente.
- **Lógica ya movida a `core`:** reemplazar las copias en `web` y borrar los tests duplicados. `GrupoMaterias` y `ResumenFinal` cambiaron de forma.
  - `plan/presentacion.ts`: `agruparMaterias` (título con `lugarMateria(grupo)`), `sinDatosCargados`, `aniosDelPlan`, `cuatrimestresDelAnio`, `materiasDePestania`, `buscarMaterias`, `materialesRecientes`, `resumenFinal` (formato en `web`: `nota != null ? formatoNota(nota) : resultado.toLowerCase()`).
  - `plan/useGuardarProgreso.ts`: `progresoInicial`.
  - `vistas/ListasCarrera.tsx`: `materiasBloqueadas`.
  - `vistas/comunes.tsx`: `situacionCorrelativas` (etiquetas en `web`), `materialesDeMateria`, `esAnual`.
  - `importacion/ImportarRespaldo.tsx`: `sinDatosCargados`, si encaja sin forzarlo.
- **Nombre de la carrera en escritorio:** completo en el menú, en dos líneas o con tooltip.

### Verificación de la tanda

`pnpm lint`, `pnpm typecheck`, `pnpm --filter web test`, `pnpm build` y `pnpm --filter web test:integracion`, con `supabase db reset` antes y después. Sumar a la integración: cambiar una nota y que persista al recargar, crear y borrar una materia propia, y un material link con su restauración. Después la coordinadora revisa en Chrome: 390 px y escritorio, claro y oscuro. No se usa Playwright; si la extensión no conecta, Chrome headless por CDP con scripts temporales fuera del repo.

## Próximos pasos

1. Relanzar la tanda 4, revisarla, commitear en commits chicos, pushear y confirmar el CI en verde.
2. Revisar el peso del JS (656 kB al cierre de la tanda 3, gzip 187 kB). Agu pidió verlo al cerrar `web`.
3. **Avisarle a Agu para que corra `supabase link`** con la contraseña de la base; subir las migraciones y repetir contra el remoto la prueba de GRANT y de `anon` con la API real.
4. Criterio 5 con Google real: elegir UCA / LCD / 7023, importar el caso de prueba, Inicio con 26 de 50 y 7,73, cambiar una nota y recargar, modo oscuro, 390 px.
5. Deploy en Vercel; requiere conectar el proyecto al repo.
6. README y comandos en `CLAUDE.md`, incluido `test:integracion` con reset antes y después.
7. Revisión independiente con el agente `revisor` y reporte final ✅/❌ de cada criterio de `docs/fases/fase-0.md`. Esperar la aprobación de Agu antes de pasar de fase.

## Pendiente de probar

- Táctil real en los gráficos (solo se probó con eventos simulados), animaciones y foco en SVG en Safari.
- Escape sobre el tooltip de los gráficos: solo cubierto por tests unitarios.
