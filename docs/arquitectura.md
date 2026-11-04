# Arquitectura de EstudIA

Fuente de verdad del diseño. Si algo no está acá o es ambiguo: **parar y preguntar a Agu** (ver `CLAUDE.md`).

## 1. Visión

- El alumno elige universidad → carrera → plan y carga su progreso (importando SIU Guaraní, a mano, o con IA).
- Ve su carrera: aprobadas, en curso, finales, pendientes, correlativas, "qué puedo cursar", promedios (mismas reglas que SIU).
- Material de estudio por materia: privado o compartido con la comunidad de esa materia (todas las camadas).
- IA que lee y **acciona** sobre los datos (con confirmación): dentro de la app, local en el dispositivo, o desde Claude/ChatGPT vía MCP.
- Distribución: web/PWA, y binarios descargables (Android APK, macOS dmg, Windows exe) desde una landing.

## 2. Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Monorepo | pnpm workspaces | `core` compartido entre web, MCP y escritorio |
| Lenguaje | TypeScript `strict` | tipos compartidos de punta a punta |
| Web | React + Vite | elegido por Agu (demanda laboral, ecosistema) |
| Estado servidor | TanStack Query | cache, reintentos, sincronización |
| Estilos | CSS propio portado de la referencia (`styles.css`), con variables | mantener la estética de la hermana |
| Backend | Supabase: Postgres + RLS, Auth (Google), Edge Functions, Realtime | todo en uno, plan gratis alcanza (ver §8) |
| Validación | zod | respaldos importados y, más adelante, herramientas de IA |
| Navegación | hash propio, sin `react-router` | igual que la referencia |
| Tests | Vitest (core y web), Testing Library + jsdom (web), `supabase test db` / pgTAP (RLS). Revisión visual en Chrome, sin Playwright | |
| CI/CD | GitHub Actions + Vercel | |
| Escritorio (fase 4) | Tauri 2 | binarios chicos, auto-update, sidecar para IA local/MCP local |
| Android (fase 4) | **decisión abierta**: Tauri 2 mobile vs Capacitor | preguntar en fase 4 |

## 3. Estructura del repo

```
estudia/
  apps/
    web/                 # React + Vite (PWA)
    mcp/                 # (fase 3) servidor MCP remoto
    desktop/             # (fase 4) Tauri
  packages/
    core/                # lógica pura: tipos, cálculo, correlativas, importadores, herramientas IA
  supabase/
    migrations/          # SQL versionado
    seed.sql             # catálogo LCD 7023 (generado desde fixtures/)
    tests/               # tests de RLS (pgTAP)
  scripts/               # generar seed, utilidades
  fixtures/              # datos de prueba (ver README de fixtures)
  docs/
  referencia/            # código original (solo lectura, en .gitignore: no se sube)
  LICENSE                # AGPL-3.0
```

El repo es público (portfolio, transparencia sobre el manejo de claves y datos, Releases y Actions gratis).

## 4. Modelo de datos

Tres capas. Todas las tablas en `public`, con RLS activado. IDs `uuid` (`gen_random_uuid()`), timestamps `timestamptz default now()`.

### 4.1 Catálogo (compartido)

- **universidades**: `id`, `nombre`, `sigla`, `sede`, `estado` (`publicado` | `pendiente`), `creado_por` (uuid → auth.users), `created_at`.
- **carreras**: `id`, `universidad_id`, `nombre`, `sigla`, `estado`, `creado_por`, `created_at`.
- **planes**: `id`, `carrera_id`, `version` (ej. `"7023"`), `estado`, `creado_por`, `nota_min` (1), `nota_max` (10), `nota_aprobacion` (4), `cuatrimestres_por_anio` (2), `cierre_cuatrimestres` (jsonb, ej. `[{"cuatrimestre":1,"mes":7},{"cuatrimestre":2,"mes":12}]`; el seed de LCD 7023 usa este valor porque el catálogo no lo trae), `created_at`. Único: (`carrera_id`, `version`).
- **materias**: `id`, `plan_id`, `codigo` (null solo en materias propias: las del catálogo siempre tienen código), `nombre`, `anio` (0 = extras/idiomas), `cuatrimestre` (null si anual/extra), `tipo` (`Materia` | `Seminario` | …), `area`, `requiere_anio_completo_para_cursar` (int null; ej. 2 = "todo 2° año aprobado"), `owner_id` (null = del catálogo; uuid = materia propia de un alumno, ej. optativa), `orden`, `created_at`. Único: (`plan_id`, `codigo`) cuando `owner_id` es null.
- **correlativas**: `materia_id`, `requiere_id`, `para` (`cursar` | `rendir`), `condicion` (`regular` | `aprobada`). PK (`materia_id`, `requiere_id`, `para`).

Estado `pendiente` = cargado por un alumno (vía IA o manual), visible solo para quien lo creó y para admins hasta que un admin lo publique.

### 4.2 Alumno (privado)

- **perfiles**: `id` (= auth.users.id), `nombre`, `avatar_url`, `es_admin` (bool, default false), `created_at`. Se crea por trigger al registrarse. El alumno **no puede** modificar `es_admin` (grants por columna).
- **inscripciones**: `id`, `user_id`, `plan_id`, `activa` (bool), `created_at`. Único (`user_id`, `plan_id`). Un alumno puede tener más de una carrera, con **como mucho una inscripción activa** (único parcial por `user_id`). Se activa con la RPC `activar_plan`.
- **progreso**: `user_id`, `materia_id`, `estado` (`pendiente` | `cursando` | `final` | `aprobada`), `p1`, `p2`, `rec`, `nota_cursada`, `nota_final_examen`, `nota` (nota final de la materia), `aplazos` (`numeric[]`), `updated_at`. PK (`user_id`, `materia_id`). Si no hay fila, la materia está `pendiente`.
- **historial**: `id`, `user_id`, `materia_id`, `fecha` (date), `tipo` (`Regularidad` | `Examen` | `Promocion` | `En curso`), `nota`, `resultado` (`Aprobado` | `Reprobado` | `Ausente` | `Promocionado` | `En curso`), `fuente` (`siu` | `manual` | `ia`).

### 4.3 Material

- **documentos** (contenido, deduplicado): `id`, `sha256` (único), `mime`, `bytes`, `paginas`, `texto` (text, null hasta extraer), `texto_tsv` (tsvector generado, configuración `spanish`), `extraido_con` (`pdfjs` | `ocr` | `ia` | null), `created_at`. Índice GIN sobre `texto_tsv`. **El binario original no se guarda en Supabase** (ver §7).
- **materiales** (lo que ve cada alumno): `id`, `user_id`, `materia_id` (null = "sin materia"; CHECK: sin materia no puede ser `compartido`. Al borrar la materia, el material queda sin materia y pasa a `privado`), `tipo` (`archivo` | `link` | `nota`), `titulo`, `documento_id` (solo archivo), `url` (solo link), `texto` (solo nota), `drive_file_id` (fase 1), `visibilidad` (`privado` | `compartido`), `anonimo` (bool), `periodo` (text, ej. `"2025-2C"`), `oculto` (bool, por denuncias o admin), `created_at`.
- **denuncias**: `id`, `material_id`, `user_id`, `motivo`, `created_at`. Único (`material_id`, `user_id`). Trigger: con **3 denuncias** distintas → `materiales.oculto = true`.

## 5. Reglas de acceso (RLS)

Funciones auxiliares `security definer`, `stable`, con `search_path` fijo:
- `es_admin()` → `perfiles.es_admin` del usuario actual.
- `cursa_o_curso(materia_id)` → existe `progreso` del usuario actual para esa materia con estado en (`cursando`, `final`, `aprobada`).

| Tabla | Leer | Escribir |
|---|---|---|
| universidades / carreras / planes | `estado = 'publicado'` o `creado_por = auth.uid()` o admin | insertar: cualquier usuario con sesión, forzando `estado = 'pendiente'` y `creado_por = auth.uid()` (admin puede publicar). Modificar/borrar: admin, o el creador mientras esté `pendiente` |
| materias / correlativas | si el plan es visible y (`owner_id` es null o `owner_id = auth.uid()`) | materias propias: el dueño. Catálogo: admin o creador de un plan `pendiente` |
| perfiles | el propio (admin: todos) | el propio, solo `nombre` y `avatar_url` |
| inscripciones / historial | solo propias | solo propias. Activar un plan: RPC `activar_plan(plan_id)`, que inscribe si hace falta y deja ese plan como único activo |
| progreso | solo propio | solo propio, y solo sobre materias de un plan donde el alumno esté inscripto o materias propias (`owner_id = auth.uid()`) |
| importación | — | RPC `reemplazar_datos_del_plan(plan_id, datos)` (security invoker, todo o nada): crea o reutiliza materias propias, reemplaza `progreso` e `historial` del alumno en ese plan y devuelve `{ clave: uuid }` de las materias propias |
| materiales | **solo propias** (admin: todas) | propias; admin puede ocultar/borrar. `oculto` solo lo cambian un admin o el trigger de denuncias: el autor no puede modificarlo |
| material compartido | vía RPC `material_compartido(materia_id)` (security definer): devuelve materiales `compartido`, no `oculto`, de esa materia, **solo si `cursa_o_curso(materia_id)`**; el autor se devuelve como `null` si `anonimo`. Del documento solo devuelve `mime`, `bytes` y `paginas`: ni `sha256` ni `id`, porque con el `id` se podría crear un material propio y leer la fila completa. Abrir un documento compartido (fase 1b) requiere una RPC que lea por `material_id` | — |
| documentos | la tabla, solo si el usuario tiene un material propio que lo referencia. El de un material compartido visible para él se expone solo por RPC y **nunca con su `sha256`**: ninguna RPC ni consulta devuelve el hash de documentos ajenos (ver §12) | vía RPC `registrar_documento(sha256, mime, bytes, paginas, texto)` que hace upsert por `sha256` y devuelve el `id`. Nunca pisa un `texto` existente: solo lo completa si era null |
| denuncias | propias (admin: todas) | insertar propias, sobre material que puede ver |

- `anon` (sin sesión): sin acceso a nada.
- Las **notas nunca se comparten**: ninguna política ni RPC expone `progreso` ni `historial` de otro usuario.
- La regla de acceso al material es **por materia** (decisión de Agu): al pasar una materia a "en curso" se desbloquea su material compartido de todas las camadas, y se mantiene después de regularizarla o aprobarla.
- Tests obligatorios de RLS en `supabase/tests/` (ver fase 0 y 1b).

## 6. Reglas de dominio (iguales a SIU Guaraní; portadas de la referencia)

- **Estados**: `pendiente`, `cursando` (en curso), `final` (cursada/regularidad aprobada, falta final), `aprobada` (final aprobado o promocionada).
- **Promedio sin aplazos**: media de `nota` de las materias `aprobada` con nota.
- **Promedio con aplazos**: suma además todas las notas de `aplazos` (finales reprobados). Ausentes no cuentan; una cursada desaprobada no es aplazo.
- **Progreso**: % aprobado = aprobadas / total del plan (redondeado); % cursado = (aprobadas + final) / total. Las materias propias cuentan en el total, como en la referencia.
- **Correlativas**: condición `regular` se cumple con estado `final` o `aprobada`; `aprobada` solo con `aprobada`. "Para cursar" usa las correlativas `cursar` + `requiere_anio_completo_para_cursar` (todas las materias de ese año en `aprobada`). "Para rendir" usa las `rendir`. Correlativas a materias inexistentes se ignoran.
- **Podés cursar**: materias `pendiente` con todas sus condiciones para cursar cumplidas.
- **Promedios por cuatrimestre y por área**: misma regla aplicada al subconjunto.
- **Promedio en el tiempo**: acumulado de eventos de `historial` (examen/promoción aprobados con nota; con aplazos suma exámenes reprobados con nota), ordenados por fecha.
- Sugerencias al editar (de la referencia): nota final ≥ aprobación → proponer `aprobada`; en curso con parciales aprobados → proponer `final`.
- La nota de aprobación (4) y la escala (1–10) salen del plan, no se hardcodean.
- Verificación: `fixtures/caso-prueba-esperado.json` (calculado con la lógica original). "Promedio en el tiempo" no está en el fixture: lleva tests propios con la lógica original.
- **Importar y restaurar respaldos**: se aceptan el formato legacy y el respaldo nuevo. Sobre datos existentes se muestra un resumen y, con confirmación, se **reemplazan** `progreso` e `historial` de ese plan (mezclar duplicaría el historial, que no tiene clave natural). El historial importado lleva `fuente = 'siu'` si el respaldo dice venir de SIU; si no, `'manual'`. El respaldo nuevo guarda las siglas de universidad y carrera, y se rechaza si no corresponden al plan. Un respaldo legacy sin ningún código en común con el plan se bloquea. Restaurar materiales agrega los que no existan (mismo título y url, o mismo `sha256`) sin borrar nada.

## 7. Material de estudio: almacenamiento

Objetivo: que la IA (y Claude vía MCP) pueda **ver y accionar sobre todo** sin llenar el plan gratis.

- **Texto en la nube**: al subir un archivo, el **dispositivo** extrae el texto (PDF.js; OCR con Tesseract.js si es escaneado; opcional IA con visión para fórmulas → Markdown + LaTeX) y lo registra en `documentos.texto`. ~2–5 % del tamaño original; Postgres lo comprime (TOAST).
- **Original en el Google Drive del alumno**: carpeta "EstudIA" con scope `drive.file` (no sensible, verificación simple). Costo cero para el proyecto. (Fase 1.)
- **Copia local en el dispositivo**: IndexedDB/OPFS, clave = `sha256`. Para offline e IA local. (Desde fase 0.)
- **Deduplicación**: por `sha256`. Mismo archivo subido por N alumnos = 1 fila en `documentos`.
- Búsqueda: full-text de Postgres en español (`texto_tsv`). Embeddings/pgvector: **no por ahora** (decisión abierta, ver §12).
- Límite de tamaño por archivo en el cliente: 50 MB.

## 8. Presupuesto (plan gratis de Supabase)

500 MB de base · 1 GB storage (no lo usamos para originales) · 5 GB/mes egress · 50k MAU · 500k invocaciones de Edge Functions · 2 proyectos activos · pausa tras 7 días sin actividad. Estimado: 10–20 MB por alumno con carrera completa → decenas de alumnos, más con dedup. Si crece: Supabase Pro (USD 25/mes). **Cualquier costo nuevo: preguntar.**

## 9. IA

### 9.1 Tres modos (el alumno elige en Ajustes)
1. **Local**: Ollama/LM Studio detectado en `localhost` (fase 2); motor embebido (llama.cpp vía sidecar de Tauri) con modelo chico descargable (fase 4). Gratis, privado, offline. Para asistente diario y apuntes.
2. **Clave propia (BYOK)**: Gemini (gratis desde Google AI Studio; por defecto, con onboarding paso a paso), Claude, OpenAI, OpenRouter. La clave queda **solo en el dispositivo**; la app llama directo al proveedor. Avisar que el plan gratis de Gemini puede usar datos para entrenar.
3. **MCP**: el alumno usa su suscripción de Claude/ChatGPT; la app expone sus datos (fase 3).

Las suscripciones de consumo (Claude Pro, ChatGPT Plus) **no** se usan como API desde la app: no hay mecanismo oficial y va contra los términos.

### 9.2 Capa de proveedores
Interfaz única en `packages/core/ia` (`chat`, `tool calling`, `salida estructurada`), con adaptadores por proveedor.

### 9.3 Herramientas (mismo registro para asistente in-app, MCP remoto y MCP local)
Definidas una vez en `packages/core/herramientas` con esquema (zod) + implementación sobre una interfaz de repositorio:
- Lectura: `ver_plan`, `ver_materia`, `que_puedo_cursar`, `simular_promedio`, `proximos_finales`, `buscar_en_apuntes` (propios + compartidos accesibles), `leer_documento(id, paginas?)`.
- Escritura (**siempre con confirmación** del usuario en la app; en MCP, el cliente pide permiso): `cargar_nota`, `cambiar_estado`, `agregar_historial`, `agregar_material` (nota/link), `crear_resumen` (nota generada), `compartir_material`.
- La IA nunca escribe SQL ni JSON crudo: solo herramientas validadas.

### 9.4 Onboarding con IA
PDF del plan / analítico → salida estructurada con el esquema de catálogo/progreso → **tabla editable de revisión obligatoria** antes de guardar. Planes nuevos quedan `pendiente` hasta aprobación de un admin.

## 10. MCP (fase 3)

- **Remoto**: Edge Function de Supabase (o Vercel; decidir en fase 3), transporte HTTP, OAuth con Supabase Auth. Usa las herramientas de §9.3 sobre los datos en Supabase (incluye texto de apuntes). Funciona en Claude (web/escritorio/celular, conectores personalizados) y ChatGPT (modo desarrollador). Verificar disponibilidad por plan al implementar.
- **Local**: incluido en la app de escritorio (Tauri), instalable en Claude Desktop como extensión `.mcpb`. Accede a originales locales. Solo escritorio.
- Cambios hechos vía MCP se ven en la app por Supabase Realtime.

## 11. Distribución (fase 4)

- PWA (ya existe en la referencia; mantener manifest e íconos nuevos). Sin plugins de PWA, service worker ni cola de escrituras offline: "Sin conexión" solo avisa.
- Tauri: `.dmg` (macOS; sin firma → aviso de Gatekeeper; firma = Apple Developer USD 99/año → **preguntar**), `.exe`/`.msi` (Windows, aviso SmartScreen), AppImage (Linux).
- Android: APK por fuera de la tienda.
- iOS: solo PWA.
- Landing con botones de descarga; binarios en GitHub Releases (descarga pública sin cuenta); build con GitHub Actions; auto-update de Tauri.

## 12. Decisiones abiertas (preguntar antes de resolver)

- Android: Tauri 2 mobile vs Capacitor (fase 4).
- Modelo local por defecto y tamaño (fase 4).
- Dónde corre el MCP remoto: Supabase Edge Functions vs Vercel vs VPS de Oracle (fase 3).
- Embeddings/pgvector para búsqueda semántica (si full-text no alcanza).
- Firma de binarios (costo).
- **Bloqueante de la fase 1: lectura de documentos por `sha256`.** Quien conozca el hash de un documento ajeno puede registrarlo con `registrar_documento`, referenciarlo con un material propio y leer su `texto`. En la fase 0 no hay riesgo real porque `texto` está vacío y el hash de documentos ajenos no se expone. Hay que resolverlo antes de guardar texto extraído. Opciones (preguntarle a Agu antes de elegir):
  - **A. Aceptar el riesgo:** tener el hash casi equivale a tener el archivo, y el hash nunca se expone. No cambia nada, pero un hash filtrado por fuera de la app da acceso al texto.
  - **B. Atar el texto a quien lo aportó:** se deduplica la fila, pero el alumno lee `texto` solo si él mismo lo aportó o si lo referencia un material compartido visible. Mantiene el ahorro si comparten; el texto de cada alumno se guarda aparte, salvo que se coteje.
  - **C. Deduplicar solo lo compartido:** los documentos privados son por alumno y se unifican al compartirlos. Es lo más simple de razonar, pero ahorra menos espacio y ajusta la decisión de deduplicar por hash.
- Moderadores por carrera (más adelante; por ahora solo admin = Agu).
- Ingeniería Química u otras carreras (más adelante; por ahora solo LCD).
