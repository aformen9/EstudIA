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
   **Las decisiones menores las tomás vos y las informás** en el resumen (nombres internos, estructura de un componente, detalles de implementación que no cambian un flujo ni el modelo). Solo se consulta lo de diseño grande.
3. **Una fase por vez.** Trabajá solo la fase indicada en `docs/fases/`. Al terminar, verificá cada criterio de aceptación, mostrá el resultado y esperá aprobación antes de pasar a la siguiente.
4. **Formato.** Las explicaciones paso a paso a Agu van en bullets cortos, no en párrafos. No cierres los mensajes con "¿arrancamos?": dejá claro qué decisión o aprobación necesitás.
5. **No uses dashboards/HTML de visualización en el chat** salvo que Agu lo pida.
6. **Commits chicos y descriptivos**, en español, uno por unidad lógica. Nunca commitear secretos ni datos reales (ver "Repo público"). **El único autor es Agu:** nunca agregues `Co-Authored-By` ni ninguna otra mención a Claude en commits, PRs ni merges (tampoco "Generated with Claude Code").
7. **Si un criterio de aceptación falla, decilo.** No lo marques como hecho.
8. **Toda idea nueva va a `docs/backlog.md`, no a la fase en curso.** Vale para las de Agu y para las tuyas. Una fase cambia de alcance solo si Agu lo aprueba explícitamente.
9. **Todo cambio a `main` va por Pull Request**, también los de docs. `main` está protegida con un ruleset: sin borrado ni force push, PR obligatorio y los tres chequeos del CI en verde ("Lint, tipos, tests y build", "Migraciones y tests de RLS", "Claves en el historial") con la rama al día. Trabajá en una rama, abrí el PR y mergeá con squash cuando Agu lo apruebe.

## Documentos (leer antes de trabajar)

- `docs/arquitectura.md` — stack, estructura del repo, modelo de datos, RLS, reglas de dominio, IA, MCP, almacenamiento, distribución, decisiones abiertas. **Es la fuente de verdad.**
- `docs/decisiones.md` — registro de decisiones tomadas con Agu (y por qué). Agregá una línea cada vez que Agu decida algo nuevo.
- `docs/fases/fase-N.md` — alcance y criterios de aceptación de cada fase.
- `docs/backlog.md` — ideas y mejoras priorizadas, fuera de la fase en curso.
- `docs/estado.md` — dónde quedó el trabajo, para retomar en otra sesión.
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

## Comandos

- `pnpm i` · `pnpm dev` (contra Supabase local, con `apps/web/.env.development.local`) · `pnpm test` · `pnpm lint` · `pnpm typecheck` · `pnpm build` · `pnpm seed` (regenera `supabase/seed.sql`)
- `supabase start` / `supabase db reset` (requiere Docker; `db reset` borra los datos locales) · `supabase test db`
- `pnpm --filter web test:integracion`: escribe en la base local; correr `supabase db reset` antes y después.
- Remoto (`supabase test db --remote`, `supabase db push`): solo con confirmación de Agu.
