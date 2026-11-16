# Fase 1 — SIU, comunidad por materia, Drive + texto y onboarding con IA

**Objetivo:** cualquier alumno de la UCA carga su carrera en minutos importando SIU Guaraní, accede al material de la comunidad de sus materias y guarda el suyo en su Drive con el texto en la nube. La IA llega al final: la app tiene que ser excelente sin IA.

Prerrequisito: fase 0 aprobada.

**Orden** (reordenado por Agu el 2026-11-16, `docs/backlog.md` §3). Antes era SIU → IA → Drive y texto, con la comunidad en una fase 1b aparte; la 1b ya no existe y es el bloque 2. Se trabaja un bloque por vez: al terminar cada uno se verifican sus criterios y se espera el ok de Agu antes del siguiente.

1. Importador de SIU Guaraní.
2. Comunidad por materia y cierre de cuatrimestre.
3. Drive + texto en la nube.
4. Onboarding con IA y clave propia.

## Antes de empezar (preguntar y decidir con Agu)

- **Verificación de Google:** averiguar qué exige sacar la app del modo "prueba" (límite de usuarios, política de privacidad, dominio propio, vencimiento de sesiones) y cómo afecta al permiso `drive.file`.
- **Tests de navegador en el repo:** reconsiderar Playwright (incluye el motor de Safari, que nunca se probó). Dependencia nueva: aprobar antes.
- **Cambios decididos el 2026-11-16 que se aplican al arrancar** (`arquitectura.md` §7 y §12):
  - Deduplicación solo de lo compartido: proponer el diseño (tablas, RPCs, qué pasa con los documentos existentes) y revisar qué bloqueantes del hash siguen vigentes (texto falso, M2, B5, B6, cuota).
  - Materias propias sin correlativas: proponer cómo migrar las que ya existan **antes de tocar nada**.

## 1. Importador de SIU Guaraní

- Activa la opción "Importar desde SIU Guaraní" y el botón "¿Cómo consigo el archivo?", que en la fase 0 quedan como "Próximamente" en el paso de carga del onboarding.
- **Formatos: Historia Académica en PDF y en XLS** (decidido el 2026-11-07). La dependencia para leer XLS se le propone a Agu después de ver un archivo real: puede ser una tabla HTML disfrazada (`docs/investigacion/siu-guarani.md`).
- Requiere que Agu baje su Historia Académica real. Los originales quedan **fuera del repo**; los tests usan ejemplos anonimizados.
- Parser en `packages/core/importadores/siu` con tests.
- **Detecta el plan desde el archivo**; match por código contra ese plan; resultado → pantalla de revisión.
- No hacer scraping con credenciales del alumno sin aprobación explícita.
- **Guía "¿Cómo consigo el archivo?"** paso a paso, con capturas. Las capturas las aporta Agu; no se inventan ni se suben con datos reales.

**Criterios:**
1. Importar un ejemplo real del Guaraní de LCD produce el mismo progreso que el caso de prueba (o el que provea Agu) sin correcciones manuales; tests del parser pasan.
2. El PDF y el XLS de una misma Historia Académica dan el mismo progreso, con tests para los dos formatos.
3. El plan se detecta desde el archivo, con tests.
4. La guía "¿Cómo consigo el archivo?" se abre desde la pantalla de importar y muestra las capturas de Agu.

## 2. Comunidad por materia y cierre de cuatrimestre

**Decisión abierta antes de empezar este bloque** (`arquitectura.md` §12): llega antes que Drive y el texto, así que hay que definir con Agu qué se comparte de un archivo mientras el original vive solo en el dispositivo del autor, y cómo funcionan los casi duplicados sin texto extraído.

### Compartir
- Al subir (o después), cada material tiene: **Privado / Compartir con la materia**, y si se comparte: **Con mi nombre / Anónimo** (elige el alumno, por archivo). Campo `periodo` (ej. "2025 · 2° cuatri") precargado con el cuatrimestre actual, editable.
- Cuando haya Drive (bloque 3), compartir un archivo comparte su **texto** y un link al original: el original vive en el Drive del autor → al compartir, la app da permiso de lectura "cualquiera con el link" a ese archivo **solo si el alumno acepta** (aviso claro). **Preguntar a Agu** si prefiere otra estrategia antes de implementar (ej. copia en Drive del que lo abre).
- Pestaña "Comunidad" en cada materia y en Materiales: material compartido accesible (`material_compartido`), agrupado por período, con autor o "Anónimo", búsqueda.
- Botón "Denunciar" (motivo: no corresponde, contenido inapropiado, derechos de autor, spam). Con 3 denuncias se oculta solo.
- **Panel de admin (mínimo):** ruta solo para `es_admin` con las denuncias: ocultar, restaurar, borrar.
- Términos de uso breves al compartir por primera vez (responsabilidad del contenido, retiro ante reclamos).
- **Ejecutables bloqueados al compartir.** Se pueden seguir subiendo como privados. La lista de tipos y cómo detectarlos sin confiar solo en la extensión se le proponen a Agu.
- Indicador en Inicio: "Hay N materiales nuevos en tus materias en curso".
- **Siembra:** la comunidad arranca con material de Agu y de Lucía, para que no esté vacía.
- Pendientes de la revisión del 2026-11-05 (`arquitectura.md` §12): M3, B9 y republicar para quedar primero.

### Duplicados al subir (`arquitectura.md` §7)
- Mismo archivo ya compartido en esa misma materia y visible para el alumno: mostrar "Este archivo ya está en el material de la materia, ¿lo querés ver?" y llevarlo ahí, sin guardar nada nuevo.
- Lo privado no se deduplica (decisión del 2026-11-16).
- Casi duplicados: similitud de texto con `pg_trgm` contra el material compartido de la materia. Si se parece mucho, preguntar "¿Es el mismo?" con las opciones Ver / Subir igual. **El umbral se define y se prueba con PDFs reales.**

### Cierre de cuatrimestre
- Según `planes.cierre_cuatrimestres`, al entrar después del cierre, la app pregunta por cada materia `cursando`: Regularicé · Promocioné · Aprobé el final · Quedé libre · La abandoné. Actualiza estado (+ instancias con `fuente = 'manual'`), recalcula correlativas y muestra "Ya podés cursar: …".
- Si hay importador de Guaraní, ofrecer revalidar contra Guaraní.
- Al pasar una materia a "En curso": mensaje "Se desbloqueó el material de la comunidad de X".

**Criterios:**
1. Tests de RLS: alumno A comparte en materia M; B (cursando M) lo ve; C (M por cursar) no; B ve autor `null` si A eligió anónimo; nadie ve el `progreso` ni las `instancias` de otro.
2. Tres denuncias de usuarios distintos ocultan el material; el admin lo restaura.
3. Flujo completo con dos cuentas de prueba (capturas).
4. Simulando la fecha de cierre, el diálogo aparece, actualiza estados y "podés cursar" cambia según correlativas.
5. Nada compartido expone el `user_id` de un autor anónimo (revisar respuesta de la RPC en Network).
6. Ninguna vía devuelve el `sha256` de documentos ajenos, tampoco las detecciones de duplicados (tests de RLS).
7. Subir un archivo ya compartido en la materia y visible lleva al material existente sin crear filas.
8. Un ejecutable subido como privado no se puede compartir, y el alumno ve un mensaje claro.
9. Con PDFs reales, un casi duplicado dispara "¿Es el mismo?", y tanto Ver como Subir igual funcionan. El umbral elegido queda registrado en `docs/decisiones.md`.

## 3. Drive + texto en la nube

- Pedir scope `drive.file` (consentimiento incremental) la primera vez que el alumno sube un archivo.
- Subir original a la carpeta "EstudIA/<materia>" del Drive del alumno; guardar `drive_file_id`.
- Extraer texto en el dispositivo: PDF.js; si la página no tiene texto → OCR (Tesseract.js, español) en un Web Worker con progreso visible. Opcional (si hay IA configurada, después del bloque 4): convertir páginas con fórmulas a Markdown + LaTeX.
- **Otros formatos:** extraer también texto de `.docx`, `.pptx`, `.txt` e imágenes (OCR). Las dependencias para `.docx` y `.pptx` se le proponen a Agu, y `extraido_con` va a necesitar valores nuevos.
- **Vista previa:** ya existe desde la fase 0, con PDF.js y caché local. La extracción reutiliza esa librería. Si se quiere ver la vista previa en otro dispositivo, dónde guardarla se decide con Agu: en la nube cambiaría el modelo de datos.
- Registrar el texto según la deduplicación solo de lo compartido (`arquitectura.md` §7).
- Abrir archivo: local si está; si no, desde Drive.
- Búsqueda en Materiales sobre el texto (full-text español) además del título.
- Migración: archivos de fase 0 (solo locales) → ofrecer subirlos a Drive y extraer texto.
- Pendientes de §12: cuota que no vuelve y `extraido_con`.

**Criterios:**
1. Subir un PDF con texto: queda en el Drive del alumno, el texto queda guardado y aparece en la búsqueda.
2. Dos alumnos que suben el mismo archivo como privado no comparten fila ni texto; el compartido se deduplica según §7.
3. Subir un PDF escaneado: el OCR extrae texto legible en español (mostrar muestra).
4. Un `.docx`, un `.pptx`, un `.txt` y una imagen con texto quedan con el texto lleno y aparecen en la búsqueda (mostrar muestra del OCR).
5. Medir y reportar: tamaño del texto vs. original sobre los PDFs de prueba.

## 4. Onboarding con IA (clave propia)

- Pantalla "Conectar IA" con onboarding paso a paso para Gemini (Google AI Studio → crear clave → pegar), con verificación de la clave y aviso de privacidad del plan gratis. Opcionales: Claude, OpenAI, OpenRouter.
- Capa de proveedores en `packages/core/ia` (`arquitectura.md` §9.2). Clave guardada solo en el dispositivo.
- Flujos: (a) subir analítico → progreso; (b) universidad/plan no está en el catálogo → subir PDF del plan → catálogo `pendiente` (§9.4). Siempre con **tabla editable de revisión** antes de guardar.
- **Panel de admin:** se suma la lista de universidades/carreras/planes `pendientes` → ver, editar, publicar o rechazar.

**Criterios:**
1. Con una clave de Gemini válida, subir el PDF del plan de otra carrera genera un plan `pendiente` revisable; el alumno lo ve, otro usuario no; el admin lo publica y pasa a verlo cualquiera.
2. Una clave inválida muestra un error entendible. La clave queda solo en el dispositivo: no aparece en logs/consola ni viaja a Supabase (verificar en la pestaña Network).
3. Tests de RLS del panel de admin.

## Fuera de alcance
Asistente/chat (fase 2) · MCP, apps descargables e IA local embebida (postergados hasta que haya demanda) · todo lo de `docs/backlog.md` §2, §5 y §6 salvo que Agu lo sume.

## Criterios de toda la fase
- Los criterios de cada bloque.
- Los tests de RLS de la fase 0 siguen pasando.
