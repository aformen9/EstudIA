# EstudIA

App para estudiantes universitarios: plan de estudios, notas, correlativas, material de estudio compartido por materia e IA integrada (en la app, local y vía MCP para Claude/ChatGPT).
Es un fork propio de "Mi Plan de Estudio" (app de la hermana de Agu, ver `referencia/mi-plan-de-estudio/`). Público inicial: alumnos de la UCA (Licenciatura en Ciencias de Datos, plan 7023) y después Argentina.

Dueño del proyecto: Agu (Agustín Formenti). Hablale en español rioplatense.

## Reglas de trabajo (OBLIGATORIAS)

1. **Proponer → debatir → "dale" → ejecutar.** Antes de escribir código, crear archivos, correr scripts o instalar dependencias, explicá qué vas a hacer y por qué, y esperá que Agu diga "dale". Una aprobación vale para el alcance que se propuso, no para cosas nuevas que aparezcan en el camino.
2. **Ante decisiones grandes de diseño o dudas: PARÁ Y PREGUNTÁ.** No inventes ni elijas por tu cuenta. Cuenta como "grande":
   - cualquier cambio al modelo de datos o a las reglas de acceso (RLS) que no esté en `docs/arquitectura.md`;
   - agregar una dependencia, servicio externo o costo nuevo;
   - cambiar el alcance de una fase o reordenarlas;
   - decisiones de UX que cambien un flujo (onboarding, compartir material, permisos);
   - todo lo listado en "Decisiones abiertas" de `docs/arquitectura.md`;
   - cuando la especificación sea ambigua, contradictoria o no cubra el caso.
   Detalles menores de implementación (nombres internos, estructura de un componente) los decidís vos y lo mencionás en el resumen.
3. **Una fase por vez.** Trabajá solo la fase indicada en `docs/fases/`. Al terminar, verificá cada criterio de aceptación, mostrá el resultado y esperá aprobación antes de pasar a la siguiente.
4. **Formato.** Las explicaciones paso a paso a Agu van en bullets cortos, no en párrafos. No cierres los mensajes con "¿arrancamos?": dejá claro qué decisión o aprobación necesitás.
5. **No uses dashboards/HTML de visualización en el chat** salvo que Agu lo pida.
6. **Commits chicos y descriptivos**, en español, uno por unidad lógica. Nunca commitear secretos ni datos reales (ver "Repo público").
7. **Si un criterio de aceptación falla, decilo.** No lo marques como hecho.

## Documentos (leer antes de trabajar)

- `docs/arquitectura.md` — stack, estructura del repo, modelo de datos, RLS, reglas de dominio, IA, MCP, almacenamiento, distribución, decisiones abiertas. **Es la fuente de verdad.**
- `docs/decisiones.md` — registro de decisiones tomadas con Agu (y por qué). Agregá una línea cada vez que Agu decida algo nuevo.
- `docs/fases/fase-N.md` — alcance y criterios de aceptación de cada fase.
- `docs/agentes.md` — cómo repartir el trabajo entre subagentes (`.claude/agents/`).
- `fixtures/` — catálogo LCD 7023, caso de prueba (formato legacy) y resultados esperados.
- `referencia/mi-plan-de-estudio/` — código original para portar estética, vistas y lógica. Solo lectura: no se despliega ni se importa. **Está en `.gitignore`: existe solo en la compu de Agu y nunca se sube al repo** (el repo es público y el código es de su hermana).

## Repo público

- El repo es **público** y la licencia es **AGPL-3.0** (`LICENSE`).
- Nunca commitear datos reales de personas (notas, nombres, mails, respaldos). Los fixtures son de un alumno inventado.
- Nunca commitear secretos. Solo la URL y la publishable key de Supabase pueden estar en el código del cliente, vía variables de entorno.
- `.gitignore` mínimo: `node_modules/`, `dist/`, `.env*` (excepto `.env.example`), `.supabase/`, `supabase/.temp/`, `.DS_Store`, `referencia/`, `*.log`, `coverage/`.

## Stack (resumen; detalle en arquitectura)

pnpm workspaces · TypeScript estricto · React + Vite (`apps/web`) · lógica pura en `packages/core` (sin dependencias de UI ni de Supabase) · Supabase (Postgres + RLS, Auth con Google, Edge Functions, Realtime) · Vercel (web) · Vitest · GitHub Actions. Más adelante: Tauri (escritorio), servidor MCP.

## Convenciones

- Dominio en español (`materia`, `correlativa`, `progreso`, `inscripcion`); código genérico en inglés está bien (`useQuery`, `Button`).
- Lógica de negocio SOLO en `packages/core`, con tests. La UI y el MCP la consumen; nunca la duplican.
- Toda escritura iniciada por IA pasa por las "herramientas" de `packages/core/herramientas` y requiere confirmación del usuario.
- SQL solo vía migraciones en `supabase/migrations/` (nunca a mano en el dashboard).
- Las claves de API de IA del usuario nunca salen de su dispositivo ni se loguean.
- Accesibilidad: respetar `prefers-reduced-motion`, contraste AA, navegación por teclado (la app de referencia ya lo hace bien: mantenerlo).

## Comandos (a completar en Fase 0)

- `pnpm i` · `pnpm dev` · `pnpm test` · `pnpm lint` · `pnpm build`
- `supabase start` / `supabase db reset` (requiere Docker) · `supabase test db`
