# Fase 1 — Onboarding completo y material en Drive + texto en la nube

**Objetivo:** cualquier alumno de la UCA carga su carrera en minutos (importando SIU Guaraní o con IA) y su material queda en su Drive con el texto disponible en la nube.

Prerrequisito: fase 0 aprobada.

## Alcance

### 1.1 Importador de SIU Guaraní
- **Es el primer punto de la fase 1** (decidido por Agu el 2026-11-07). Activa la opción "Importar desde SIU Guaraní" y el botón "¿Cómo consigo el archivo?", que en la fase 0 quedan como "Próximamente" en el paso de carga del onboarding.
- Investigar primero qué puede exportar el alumno desde SIU Guaraní 3 (historia académica en PDF, plan de estudios, reporte de actuación) y **mostrarle a Agu las opciones antes de implementar** (parser de PDF vs pegar texto vs otra vía). No hacer scraping con credenciales del alumno sin aprobación explícita.
- Parser en `packages/core/importadores/siu` con tests a partir de ejemplos reales que provea Agu (anonimizados).
- Match por código contra el plan elegido; resultado → pantalla de revisión.
- **Formatos: Historia Académica en PDF y en XLS** (decidido por Agu el 2026-11-07). La dependencia para leer XLS se le propone a Agu en esta fase, después de ver un archivo real: puede ser una tabla HTML disfrazada (`docs/investigacion/siu-guarani.md`).
- **Guía "¿Cómo consigo el archivo?"** paso a paso, con capturas. Las capturas las aporta Agu; no se inventan ni se suben con datos reales.

### 1.2 Onboarding con IA (clave propia)
- Pantalla "Conectar IA" con onboarding paso a paso para Gemini (Google AI Studio → crear clave → pegar), con verificación de la clave y aviso de privacidad del plan gratis. Opcionales: Claude, OpenAI, OpenRouter.
- Capa de proveedores en `packages/core/ia` (§9.2). Clave guardada solo en el dispositivo.
- Flujos: (a) subir analítico → progreso; (b) universidad/plan no está en el catálogo → subir PDF del plan → catálogo `pendiente` (§9.4). Siempre con **tabla editable de revisión** antes de guardar.

### 1.3 Panel de admin (mínimo)
- Ruta solo para `es_admin`: lista de universidades/carreras/planes `pendientes` → ver, editar, publicar o rechazar.

### 1.4 Material: Drive + texto
- Pedir scope `drive.file` (consentimiento incremental) la primera vez que el alumno sube un archivo.
- Subir original a la carpeta "EstudIA/<materia>" del Drive del alumno; guardar `drive_file_id`.
- Extraer texto en el dispositivo: PDF.js; si la página no tiene texto → OCR (Tesseract.js, español) en un Web Worker con progreso visible. Opcional (si hay IA configurada): convertir páginas con fórmulas a Markdown + LaTeX.
- **Otros formatos:** extraer también texto de `.docx`, `.pptx`, `.txt` e imágenes (OCR). Las dependencias para `.docx` y `.pptx` se le proponen a Agu en esta fase, y `extraido_con` va a necesitar valores nuevos.
- **Vista previa:** ya existe desde la fase 0, con PDF.js y caché local. La extracción reutiliza esa librería. Si se quiere ver la vista previa en otro dispositivo, dónde guardarla se decide con Agu: en la nube cambiaría el modelo de datos.
- `registrar_documento` con `sha256` + texto. Si el `sha256` ya existe con texto, no reprocesar.
- Abrir archivo: local si está; si no, desde Drive.
- Búsqueda en Materiales sobre el texto (full-text español) además del título.
- Migración: archivos de fase 0 (solo locales) → ofrecer subirlos a Drive y extraer texto.

## Fuera de alcance
Compartir material y comunidades (1b) · asistente/chat (2) · MCP (3).

## Criterios de aceptación
1. Importar un ejemplo real del Guaraní de LCD produce el mismo progreso que el caso de prueba (o el que provea Agu) sin correcciones manuales; tests del parser pasan.
2. Con una clave de Gemini válida, subir el PDF del plan de otra carrera genera un plan `pendiente` revisable; el alumno lo ve, otro usuario no; el admin lo publica y pasa a verlo cualquiera.
3. Una clave inválida muestra un error entendible. La clave queda solo en el dispositivo: no aparece en logs/consola ni viaja a Supabase (verificar en la pestaña Network).
4. Subir un PDF con texto: queda en el Drive del alumno, `documentos.texto` tiene contenido y aparece en la búsqueda. Subir el mismo archivo con otro usuario no crea otra fila en `documentos`.
5. Subir un PDF escaneado: el OCR extrae texto legible en español (mostrar muestra).
6. Medir y reportar: tamaño del texto vs. original sobre los PDFs de prueba.
7. Tests de RLS siguen pasando; nuevos tests para el panel de admin.
8. El PDF y el XLS de una misma Historia Académica dan el mismo progreso, con tests para los dos formatos. La guía "¿Cómo consigo el archivo?" se abre desde la pantalla de importar y muestra las capturas de Agu.
9. Un `.docx`, un `.pptx`, un `.txt` y una imagen con texto quedan con `documentos.texto` lleno y aparecen en la búsqueda (mostrar muestra del OCR).
