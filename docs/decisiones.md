# Registro de decisiones

Una línea por decisión de Agu. Agregar al final, con fecha. Si una decisión nueva contradice una vieja, tacharla y explicar.

## 2026-11-03 (diseño inicial, conversación con Claude)

- Fork propio de "Mi Plan de Estudio" (app de la hermana). Nombre: **EstudIA**.
- Público inicial: UCA y Argentina. Catálogo inicial: **solo LCD plan 7023**. Ingeniería Química queda para después.
- Backend: **Supabase** (Agu libera un lugar en su cuenta; 2 proyectos activos máx. en plan gratis).
- Framework: **React** (+ TypeScript + Vite).
- Estética: **mantener la de la hermana** (paleta, tipografías, animaciones). **Logo nuevo neutro**, sin la flor.
- Login: **Google** (también da el permiso de Drive).
- Material de estudio: **originales en el dispositivo + Google Drive del alumno**; **texto extraído en la nube** para que la IA/Claude vea todo. Deduplicación por hash: sí.
- Comunidades: **acceso al material compartido por materia** (no por año), todas las camadas, desde que la materia está en curso.
- Autoría de aportes: **la elige el alumno** (con nombre o anónimo) en cada archivo.
- Moderación: **solo Agu (admin)** por ahora; moderadores más adelante.
- Onboarding: elegir universidad → carrera → plan; universidades/planes nuevos quedan pendientes hasta que un admin los apruebe.
- Al cierre de cada cuatrimestre la app pregunta cómo le fue en cada materia en curso y actualiza estados.
- IA: tres modos (local, clave propia con Gemini gratis por defecto, MCP con la suscripción del alumno). Herramientas únicas compartidas.
- MCP: remoto (datos en Supabase) primero; local (escritorio, archivos) después.
- Distribución: PWA + binarios (APK, dmg, exe) desde una landing; binarios en GitHub Releases.
- Orden de fases: 0 → 1 → 1b → 2 → 3 → 4 → 5 (ver `docs/fases/`).
- Implementación con **Claude Code + subagentes** sobre este repo; ante decisiones grandes de diseño o dudas, **parar y preguntar**.
- Repo **público**, licencia **AGPL-3.0**. Fixtures con un **alumno inventado** (sin datos reales). `referencia/` (código de la hermana) en `.gitignore`: solo local, con crédito en el README.

## 2026-11-03 (plan de la fase 0)

- Dependencias aprobadas además del stack: **zod** (validar respaldos), **tsx** (generar el seed), **Testing Library** y **jsdom** (tests de web).
- Se evitan **react-router** (navegación por hash propia, como la referencia), **Playwright** (revisión visual en Chrome) y **plugins de PWA**.
- RLS `materiales.oculto`: solo lo cambian un admin o el trigger de denuncias, para que el autor no pueda volver a mostrar un material denunciado.
- RLS `registrar_documento`: no pisa un `texto` existente, para que nadie con el hash reemplace el texto de un documento compartido.
- RLS `progreso`: solo acepta materias de un plan donde el alumno esté inscripto o materias propias (`owner_id = auth.uid()`), para que no pueda destrabar material de otra carrera.
- `materiales.materia_id` admite null ("sin materia", como en la referencia), con un CHECK que impide `visibilidad = 'compartido'` sin materia. Al borrar la materia, el material queda sin materia y pasa a privado.
- Importar un respaldo sobre datos existentes: mostrar un resumen y, con confirmación, **reemplazar** `progreso` e `historial` de ese plan (mezclar duplicaría el historial, que no tiene clave natural).
- El respaldo `.json` nuevo también se puede **restaurar**, además de importar el viejo.
- Las materias propias cuentan en el total y en los porcentajes, como en la referencia.
- Historial importado: `fuente = 'siu'` si el respaldo dice venir de SIU; si no, `'manual'`.
- Seed: `cierre_cuatrimestres` con el ejemplo de la arquitectura (julio y diciembre), porque el catálogo no lo trae.
- Sin service worker ni cola de escrituras offline: "Sin conexión" solo avisa, como en la referencia.
- "Promedio en el tiempo" no está en el fixture esperado: lleva tests propios con la lógica original, sin tocar los fixtures.
