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
| CI/CD | GitHub Actions + Vercel. gitleaks en el CI para detectar claves reales | |
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
- **materias**: `id`, `plan_id`, `codigo` (null solo en materias propias: las del catálogo siempre tienen código), `nombre`, `anio` (0 = extras/idiomas), `cuatrimestre` (null si anual/extra), `tipo` (`Materia` | `Seminario` | …), `area`, `requiere_anio_completo_para_cursar` (int null; ej. 2 = "todo 2° año aprobado"), `owner_id` (null = del catálogo; uuid = materia propia de un alumno, ej. optativa), `orden`, `created_at`. Único: (`plan_id`, `codigo`) cuando `owner_id` es null. Un trigger impide borrar una materia del catálogo que tenga `progreso` o `historial` de cualquier alumno, también cuando el borrado viene en cascada desde el plan; las materias propias se borran normal, con sus datos.
- **correlativas**: `materia_id`, `requiere_id`, `para` (`cursar` | `rendir`), `condicion` (`regular` | `aprobada`). PK (`materia_id`, `requiere_id`, `para`).

Estado `pendiente` = cargado por un alumno (vía IA o manual), visible solo para quien lo creó y para admins hasta que un admin lo publique.

### 4.2 Alumno (privado)

- **perfiles**: `id` (= auth.users.id), `nombre`, `avatar_url`, `es_admin` (bool, default false), `created_at`. Se crea por trigger al registrarse. El alumno **no puede** modificar `es_admin` (grants por columna).
- **inscripciones**: `id`, `user_id`, `plan_id`, `activa` (bool), `created_at`. Único (`user_id`, `plan_id`). Un alumno puede tener más de una carrera, con **como mucho una inscripción activa** (único parcial por `user_id`). Se activa con la RPC `activar_plan`. La FK a `planes` es `ON DELETE RESTRICT`: no se puede borrar un plan con inscripciones, y por eso tampoco su carrera ni su universidad. No hay estado "archivado" por ahora.
- **progreso**: `user_id`, `materia_id`, `estado` (`pendiente` | `cursando` | `final` | `aprobada`), `p1`, `p2`, `rec`, `nota_cursada`, `nota_final_examen`, `nota` (nota final de la materia), `aplazos` (`numeric[]`), `updated_at`. PK (`user_id`, `materia_id`). Si no hay fila, la materia está `pendiente`.
- **historial**: `id`, `user_id`, `materia_id`, `fecha` (date), `tipo` (`Regularidad` | `Examen` | `Promocion` | `En curso`), `nota`, `resultado` (`Aprobado` | `Reprobado` | `Ausente` | `Promocionado` | `En curso`), `fuente` (`siu` | `manual` | `ia`).

### 4.3 Material

- **documentos** (contenido, deduplicado): `id`, `sha256` (único), `mime`, `bytes`, `paginas`, `texto` (text, null hasta extraer), `texto_tsv` (tsvector generado, configuración `spanish`), `extraido_con` (`pdfjs` | `ocr` | `ia` | null), `created_at`. Índice GIN sobre `texto_tsv`. **El binario original no se guarda en Supabase** (ver §7).
- **limites_documentos** (una sola fila, sin acceso desde la API): tope de texto por documento (unos 2 MB) y cuota por usuario (unos 50 MB). Se cambian sin tocar código.
- **uso_documentos** (sin acceso desde la API): `user_id`, `documento_id`, bytes contados. Lo escribe `registrar_documento` para aplicar la cuota.
- **materiales** (lo que ve cada alumno): `id` (lo puede generar el cliente: un reintento con el mismo id no duplica), `user_id`, `materia_id` (null = "sin materia"; CHECK: sin materia no puede ser `compartido`. Al borrar la materia, el material queda sin materia y pasa a `privado`. Al moverlo a otra materia, también pasa a `privado`), `tipo` (`archivo` | `link` | `nota`), `titulo`, `documento_id` (solo archivo; varios materiales pueden apuntar al mismo documento), `url` (solo link, y solo `http` o `https`), `texto` (solo nota), `drive_file_id` (fase 1), `visibilidad` (`privado` | `compartido`), `anonimo` (bool), `periodo` (text, ej. `"2025-2C"`), `oculto` (bool, por denuncias o admin), `created_at` (el cliente puede mandar una fecha pasada, para restaurar respaldos; una futura se lleva a ahora), `compartido_en` (la fija siempre el servidor al pasar a `compartido` y se borra al volver a `privado`; `material_compartido` ordena por esta columna). `user_id` no se puede cambiar.
- **denuncias**: `id`, `material_id`, `user_id`, `motivo`, `created_at`. Único (`material_id`, `user_id`). Trigger: con **3 denuncias** distintas → `materiales.oculto = true`.

## 5. Reglas de acceso (RLS)

Funciones auxiliares `security definer`, `stable`, con `search_path` fijo:
- `es_admin()` → `perfiles.es_admin` del usuario actual.
- `cursa_o_curso(materia_id)` → existe `progreso` del usuario actual para esa materia con estado en (`cursando`, `final`, `aprobada`).

| Tabla | Leer | Escribir |
|---|---|---|
| universidades / carreras / planes | `estado = 'publicado'` o `creado_por = auth.uid()` o admin | insertar: cualquier usuario con sesión, forzando `estado = 'pendiente'` y `creado_por = auth.uid()` (admin puede publicar). Modificar/borrar: admin, o el creador mientras esté `pendiente` |
| materias / correlativas | si el plan es visible y (`owner_id` es null o `owner_id = auth.uid()`) | materias propias: el dueño, solo en un plan visible. Catálogo: admin o creador de un plan `pendiente`. Una correlativa solo apunta a una materia visible del mismo plan, y una materia del catálogo no puede depender de una propia |
| perfiles | el propio (admin: todos) | el propio, solo `nombre` y `avatar_url` |
| inscripciones | solo propias | solo propias y en un plan visible. Activar un plan: RPC `activar_plan(plan_id)`, que inscribe si hace falta y deja ese plan como único activo |
| progreso / historial | solo propio | solo propio, y solo sobre materias de un plan donde el alumno esté inscripto o materias propias (`owner_id = auth.uid()`) |
| importación | — | RPC `reemplazar_datos_del_plan(plan_id, datos)` (security invoker, todo o nada): crea o reutiliza materias propias, reemplaza `progreso` e `historial` del alumno en ese plan y devuelve `{ clave: uuid }` de las materias propias. Reutiliza la materia propia del alumno en ese plan con el mismo código o, sin código, otra sin código y con el mismo nombre: el archivo pisa sus datos y sus correlativas. Las materias propias que no vienen en el archivo se conservan |
| materiales | **solo propias** (admin: todas) | propias, y solo en una materia visible o sin materia; admin puede ocultar/borrar. `oculto` solo lo cambian un admin o el trigger de denuncias: el autor no puede modificarlo |
| material compartido | vía RPC `material_compartido(materia_id)` (security definer): devuelve materiales `compartido`, no `oculto`, de esa materia, **solo si `cursa_o_curso(materia_id)`**; el autor se devuelve como `null` si `anonimo`. Del documento solo devuelve `mime`, `bytes` y `paginas`: ni `sha256` ni `id`, porque con el `id` se podría crear un material propio y leer la fila completa. Abrir un documento compartido (fase 1b) requiere una RPC que lea por `material_id` | — |
| documentos | la tabla, solo si el usuario tiene un material propio que lo referencia, sin excepción para admin (moderar un archivo necesitará otra vía). El de un material compartido visible para él se expone solo por RPC y **nunca con su `sha256`**: ninguna RPC ni consulta devuelve el hash de documentos ajenos (ver §7) | vía RPC `registrar_documento(sha256, mime, bytes, paginas, texto)` que hace upsert por `sha256` y devuelve el `id`. Nunca pisa un `texto` existente: solo lo completa si era null |
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
- **Importar y restaurar respaldos**: se aceptan el formato legacy y el respaldo nuevo. Sobre datos existentes se muestra un resumen y, con confirmación, se **reemplazan** `progreso` e `historial` de ese plan (mezclar duplicaría el historial, que no tiene clave natural). El historial importado lleva `fuente = 'siu'` si el respaldo dice venir de SIU; si no, `'manual'`. El respaldo nuevo guarda las siglas de universidad y carrera, y se rechaza si no corresponden al plan. Un respaldo legacy sin ningún código en común con el plan se bloquea. Restaurar materiales agrega los que no existan (en la misma materia; archivo: mismo `sha256`; link: mismo título y url; nota: mismo título y texto) sin borrar nada, y conserva `periodo` y `createdAt`. No es todo o nada: si falla alguno se avisa cuántos faltaron, y reintentar no los duplica.

## 7. Material de estudio: almacenamiento

Objetivo: que la IA (y Claude vía MCP) pueda **ver y accionar sobre todo** sin llenar el plan gratis.

- **Texto en la nube**: al subir un archivo, el **dispositivo** extrae el texto (PDF.js; OCR con Tesseract.js si es escaneado; opcional IA con visión para fórmulas → Markdown + LaTeX) y lo registra en `documentos.texto`. ~2–5 % del tamaño original; Postgres lo comprime (TOAST).
- **Original en el Google Drive del alumno**: carpeta "EstudIA" con scope `drive.file` (no sensible, verificación simple). Costo cero para el proyecto. (Fase 1.)
- **Copia local en el dispositivo**: IndexedDB/OPFS, clave = `sha256`. Para offline e IA local. (Desde fase 0.)
- **Deduplicación global**: por `sha256`, para documentos privados y compartidos. Mismo archivo subido por N alumnos = 1 fila en `documentos`.
  - **El hash no se expone:** ningún usuario puede obtener el `sha256` de documentos ajenos por ninguna vía, y hay tests que lo comprueban.
  - **Consecuencia aceptada:** quien ya tenga el hash de un documento (por tener el archivo o porque se filtró por fuera de la app) puede registrarlo y leer su `texto`, y deducir si alguien ya lo subió.
  - **Al subir un archivo cuyo `sha256` ya existe:**
    - Si está compartido en esa misma materia y el alumno puede verlo: se muestra "Este archivo ya está en el material de la materia, ¿lo querés ver?" y se lo lleva ahí, sin guardar nada nuevo (fase 1b).
    - Si solo existe como privado de otro usuario: se reutiliza en silencio. Para el alumno aparece como subido por él, sin aviso.
  - **Casi duplicados (fase 1b):** similitud de texto con `pg_trgm` contra el material compartido de la materia. Si se parece mucho, se pregunta "¿Es el mismo?" con las opciones Ver / Subir igual. El umbral se define y se prueba con PDFs reales en esa fase.
- Búsqueda: full-text de Postgres en español (`texto_tsv`). Embeddings/pgvector: **no por ahora** (decisión abierta, ver §12).
- Límite de tamaño por archivo en el cliente: 50 MB.
- **Límites en el servidor:** `registrar_documento` rechaza un texto de más de unos 2 MB y frena al usuario que supera unos 50 MB de cuota, con un error que la app le explica al alumno. Los valores están en `limites_documentos`. El error se decide antes de mirar si el documento ya existe, para no revelarlo.
- **Un material en varias materias:** "Agregar también a…" crea otra referencia al mismo documento, sin duplicar archivo ni copia local. "Mover a otra materia" cambia la referencia y un material compartido pasa a privado. La copia local se borra solo si ninguna otra referencia del usuario la usa, de cualquier plan.
- **Borrar un material:** desaparece en pantalla al instante, con "Deshacer" durante unos 8 s. El borrado real ocurre al vencer ese plazo.

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
- **Texto no confiable (prompt injection):** la IA y el MCP tratan todo texto de documentos y material como datos no confiables, nunca como instrucciones. Lo que venga de ahí no puede disparar herramientas ni saltear la confirmación de las escrituras. Lleva tests cuando lleguen las fases de IA y MCP.

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
- **Bloqueante de la fase 1: texto falso en documentos.** Con la deduplicación global (§7), el primero que registra un `sha256` fija el texto para todos, y `registrar_documento` no comprueba que ese texto salga del archivo. Quien conozca un hash podría cargar un texto falso, y lo recibiría cualquiera que suba después ese mismo archivo. Hay que resolverlo antes de guardar texto extraído: preguntarle a Agu antes de elegir.
- Selector de notas según la escala del plan: cuando haya carreras con decimales, debería salir de la escala, agregando al plan un "paso" de nota (1, 0,5, 0,01). Por ahora: enteros más el valor existente, si la nota guardada tiene decimales.
- **Bloqueantes de la fase 1 (revisión del 2026-11-05):**
  - M2: un admin puede leer el hash y el texto de un documento privado ajeno, creando un material propio con su `documento_id`. Contradice §5 y §7.
  - B2: se puede acaparar una versión de plan, y el error revela planes pendientes.
  - B5: el primero que registra un hash también fija `mime`, `bytes` y `paginas`.
  - B6: los documentos quedan para siempre, aunque se borre el material o la cuenta.
- **Para la fase 1b (revisión del 2026-11-05), con la recomendación de Agu:**
  - M3: el autor puede volver a publicar un material oculto, copiándolo o borrando el original y sus denuncias. Recomendación: el autor no puede volver a compartir un contenido oculto y el admin puede suspenderle compartir.
  - B9: una sola denuncia vuelve a ocultar lo que un admin restauró. Recomendación: el contador de denuncias se reinicia al restaurar.
- **Login por mail:** queda activo en el stack local, para el login de prueba. En el remoto lo apaga Agu en el panel antes de `supabase link`.
- Moderadores por carrera (más adelante; por ahora solo admin = Agu).
- Ingeniería Química u otras carreras (más adelante; por ahora solo LCD).
