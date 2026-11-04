# Fase 2 — Asistente IA dentro de la app (nube + local vía Ollama)

**Objetivo:** un chat dentro de la app que responde sobre la carrera y los apuntes y **ejecuta cambios** con confirmación.

Prerrequisito: fase 1b aprobada.

## Alcance
- Registro de herramientas en `packages/core/herramientas` (§9.3 de arquitectura): esquemas zod + implementación sobre una interfaz `Repositorio` (implementación Supabase en la web; en fase 3 la reusa el MCP).
- Chat (panel lateral o vista "Asistente"), streaming, historial de la conversación en el dispositivo.
- Proveedores: los de fase 1 + **Ollama / LM Studio** detectados en `localhost` (mostrar cómo instalar y qué modelo bajar; sugerir 2–3 modelos chicos con buen tool calling y **preguntar a Agu** cuál recomendar por defecto).
- Escrituras: la IA propone → tarjeta de confirmación con el cambio exacto ("Optimización: En curso → Aprobada, nota 9") → aplicar / descartar. Nunca escribir sin confirmar.
- `buscar_en_apuntes` y `leer_documento` sobre texto propio + compartido accesible; respuestas citan el documento y página.
- Selector de modo de IA en Ajustes (Local / Clave propia / ninguno), con estado de conexión.
- Límites: contexto recortado (no mandar el plan entero si no hace falta), aviso si la clave gratuita llegó al límite.

## Criterios de aceptación
1. Tests de cada herramienta en `core` (lectura y escritura) con el caso de prueba.
2. Con Gemini y con un modelo local en Ollama: "¿qué puedo cursar?" responde GWA6803 con el caso de prueba y explica por qué 4° año está bloqueado.
3. "Aprobé Cálculo Avanzado con 7" → tarjeta de confirmación → al aceptar, estado y promedio se actualizan; al descartar, nada cambia.
4. Pregunta sobre un apunte subido devuelve respuesta con cita al documento correcto.
5. Sin IA configurada, la app funciona igual y el asistente explica cómo conectarla.
6. Las claves nunca viajan a Supabase (verificar Network).
