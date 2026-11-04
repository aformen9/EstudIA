# Fase 3 — MCP remoto para Claude y ChatGPT

**Objetivo:** el alumno conecta EstudIA como conector en Claude o ChatGPT y desde ahí ve y modifica su carrera y busca en sus apuntes, usando su propia suscripción.

Prerrequisito: fase 2 aprobada.

## Antes de implementar (preguntar)
- Dónde corre: Supabase Edge Functions vs Vercel vs VPS (Oracle) — comparar límites, latencia, timeouts y costo, y **preguntar**.
- Verificar con documentación actual: cómo agrega un conector remoto un usuario de Claude (planes que lo permiten) y de ChatGPT (modo desarrollador), y requisitos de OAuth de cada uno.

## Alcance
- `apps/mcp`: servidor MCP con transporte HTTP (SDK oficial de TypeScript), reutilizando `packages/core/herramientas` sin duplicar lógica.
- Auth: OAuth 2.1 contra Supabase Auth (el alumno inicia sesión con Google); el servidor actúa con el token del alumno → RLS se aplica igual que en la app.
- Herramientas: todas las de §9.3, con descripciones claras para el modelo; escrituras marcadas como tales (el cliente pide permiso).
- Cambios vía MCP visibles en la app al instante (Supabase Realtime).
- Página en la app "Conectar con Claude / ChatGPT" con pasos y la URL del servidor.
- 3b (después de fase 4): MCP local dentro de la app de escritorio (extensión `.mcpb` para Claude Desktop) con acceso a originales locales.

## Criterios de aceptación
1. Conectado en Claude: "¿cuál es mi promedio?" devuelve el valor correcto; "aprobé Optimización con 9" pide permiso, aplica y la app lo muestra sin recargar.
2. Conectado en ChatGPT (si el plan de prueba lo permite): misma prueba de lectura.
3. "Buscá en mis apuntes de Cálculo Avanzado ejercicios de integrales de línea" devuelve fragmentos con referencia al documento.
4. Un token de otro usuario no accede a datos ajenos (test automatizado).
5. Tests de las herramientas siguen siendo los de `core` (no hay lógica nueva en `apps/mcp` salvo transporte/auth).
