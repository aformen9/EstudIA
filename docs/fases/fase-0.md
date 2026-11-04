# Fase 0 — Base: misma app que la referencia, sobre la estructura definitiva

**Objetivo:** EstudIA funciona igual que "Mi Plan de Estudio" (sin IA ni comunidades todavía), pero con el modelo de datos de tres capas, login con Google, catálogo LCD 7023 precargado y tests.

Leer antes: `docs/arquitectura.md` §2–§6, `docs/agentes.md`, `referencia/mi-plan-de-estudio/`.

## Prerrequisitos (los hace Agu; guiarlo paso a paso si los pide)

- [ ] Repo `estudia` en GitHub con este paquete adentro.
- [x] Proyecto de Supabase nuevo (región Américas, "Automatically expose new tables" desactivado). URL + publishable key en `apps/web/.env.local` (no se commitea; dejar `.env.example`).
- [x] Cliente OAuth de Google (Google Cloud Console → Credenciales → ID de cliente OAuth "Aplicación web"), con la URL de callback de Supabase; cargado en Supabase → Authentication → Providers → Google.
- [ ] Docker instalado (para `supabase start` local).
- [ ] Proyecto en Vercel conectado al repo (puede quedar para el final de la fase).

Si falta alguno, se puede avanzar con Supabase local (`supabase start`) y dejar lo remoto para el final.

## Alcance

### 0.1 Scaffold
- pnpm workspaces: `apps/web`, `packages/core`. TypeScript estricto, ESLint + Prettier, Vitest.
- `supabase init` y estructura de `supabase/`.
- Scripts raíz: `dev`, `build`, `test`, `lint`, `typecheck`.

### 0.2 `packages/core`
- Tipos del dominio (catálogo, progreso, historial, material) — **primero, porque son el contrato entre agentes**.
- Cálculo (§6 de arquitectura): estados, promedios (con/sin aplazos, por cuatrimestre, por área, en el tiempo), progreso, correlativas para cursar/rendir (incluida la regla de año completo), "podés cursar", sugerencias de estado.
- Importador legacy: convierte un respaldo `.json` de la app vieja (formato de `fixtures/caso-prueba-legacy.json`) en `progreso` + `historial` contra un plan del catálogo, haciendo match por `codigo`. Materias sin match → materias propias, salvo que ningún código coincida con el plan: ahí se bloquea con un mensaje claro. Reporta qué no pudo mapear.
- Escala de notas y nota de aprobación tomadas del plan.

### 0.3 Supabase
- Migraciones con **todas** las tablas de §4 (las de material se crean ahora aunque la UI de compartir llegue en 1b), funciones auxiliares, RPCs (`registrar_documento`, `material_compartido`), trigger de perfil y de denuncias, RLS de §5.
- `scripts/generar-seed.ts`: genera `supabase/seed.sql` desde `fixtures/lcd-7023-catalogo.json` (universidad UCA Rosario, carrera LCD, plan 7023 **publicado**, 50 materias, correlativas, regla de 2° año completo).
- Tests de RLS (pgTAP) en `supabase/tests/`.
- Cómo marcar a Agu como admin: documentar el `update perfiles set es_admin = true where id = …` (se corre a mano una vez; no hay UI).

### 0.4 `apps/web`
- Portar `styles.css` de la referencia (paleta, tipografías Bricolage Grotesque + Plus Jakarta Sans, modo claro/oscuro, blobs, constelación, tilt, confeti, `prefers-reduced-motion`).
- **Logo neutro nuevo** (sin flor): proponer 2–3 opciones en SVG **y preguntar a Agu** antes de generar los íconos PWA (192, 512, maskable, apple-touch, favicon).
- Login con Google (reemplaza contraseña y link por mail).
- Onboarding mínimo: universidad → carrera → plan (solo publicados) → marcar estado de materias con una grilla rápida, **o** importar respaldo `.json` viejo.
- Vistas iguales a la referencia: Inicio (anillo, KPIs, alerta de año completo, finales por rendir, este cuatrimestre, podés anotarte, material reciente), Materias (tabs año/cuatrimestre, búsqueda), Aprobadas, En curso, Finales pendientes, Pendientes, Promedio (gráficos SVG con tooltip), Materiales.
- Panel de materia: correlativas para cursar/rendir con estado, estado, parciales/notas/aplazos, historial, material. Editar nombre/correlativas **solo en materias propias** (las del catálogo son de solo lectura para el alumno).
- Materiales (paridad): links y notas en la nube; **archivos guardados localmente** (IndexedDB/OPFS por `sha256`) y registrados con `registrar_documento` (sin texto todavía). Abrir un archivo funciona en el dispositivo donde se subió; en otro dispositivo mostrar "disponible en el dispositivo donde lo subiste (Drive llega en la fase 1)".
- Guardado por materia (upsert de `progreso`), indicador "Guardando… / Guardado en la nube / Sin conexión".
- Ajustes: nombre, cambiar de carrera/plan, descargar respaldo (`.json` nuevo), importar respaldo viejo, cerrar sesión.
- PWA: manifest con nombre EstudIA e íconos nuevos.

### 0.5 Calidad y entrega
- GitHub Actions: `lint`, `typecheck`, `test` (core + web) y gitleaks en cada push/PR; tests de RLS con `supabase start` en CI si es viable (si no, documentar y preguntar).
- Deploy en Vercel.
- `README.md` del repo: cómo correr local, variables, cómo hacerse admin.

## Fuera de alcance (no hacer en fase 0)

IA de cualquier tipo · Google Drive · extracción de texto/OCR · compartir material y comunidades · importador de SIU Guaraní · cierre de cuatrimestre · MCP · Tauri.

## Criterios de aceptación (verificar y reportar cada uno)

1. `pnpm i && pnpm test && pnpm lint && pnpm typecheck && pnpm build` pasan sin errores.
2. Tests de `core` con `fixtures/caso-prueba-legacy.json` (alumno inventado) importado contra el catálogo dan **exactamente** `fixtures/caso-prueba-esperado.json` (4 decimales): 50 materias; 26 aprobadas, 5 en curso, 2 finales, 17 pendientes; 52 % aprobado y 56 % cursado; promedio 7,7308 sin aplazos y 7,3571 con aplazos; aplazos GMA1234 (2) y GCO0406 (3); podés cursar = [GES0314, GWA6803]; GES0315 no se puede rendir (falta GMA0212); 4° año bloqueado por GMA0212; correlativas materia por materia.
3. `supabase db reset` aplica migraciones + seed sin errores; el plan LCD 7023 tiene 50 materias y sus correlativas.
4. Tests de RLS prueban como mínimo:
   - un usuario no ve ni modifica `progreso`, `historial`, `inscripciones` ni `materiales` de otro;
   - `anon` no lee nada;
   - un usuario no puede ponerse `es_admin = true`;
   - un plan `pendiente` solo lo ven su creador y admins;
   - `material_compartido` devuelve el material compartido de una materia solo si el usuario la cursa o cursó, y devuelve autor `null` si es anónimo;
   - con 3 denuncias el material queda oculto;
   - no se puede borrar un plan con inscripciones;
   - no se puede borrar una materia del catálogo con progreso o historial, y una materia propia sí;
   - `historial` exige lo mismo que `progreso`: materia de un plan inscripto o materia propia.
5. Flujo manual en el navegador (con capturas): entrar con Google → elegir UCA / LCD / 7023 → importar el caso de prueba legacy → Inicio muestra 26 de 50 y promedio 7,73 → cambiar una nota y recargar persiste → modo oscuro → vista celular (390 px) sin scroll horizontal.
6. Ninguna clave real en el repo: gitleaks corre en el CI sobre todo el historial y no encuentra nada.
7. Logo aprobado por Agu.

Al terminar: resumen corto, lista de criterios con ✅/❌ y lo que quedó pendiente o dudoso. Esperar aprobación antes de la fase 1.
