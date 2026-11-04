# EstudIA: paquete de especificación

Todo lo que necesita Claude Code para construir EstudIA fase por fase.

## Cómo usarlo

1. Repo público `EstudIA` en GitHub, clonado en tu compu.
2. Copiá el contenido de este paquete en la raíz del repo, incluida la carpeta oculta `.claude/` (en el Finder, `Cmd + Shift + .` muestra los archivos ocultos). La carpeta `referencia/` queda en tu compu pero no se sube: Claude Code la agrega al `.gitignore` antes del primer commit.
3. Abrí Claude Code en la carpeta del repo.
4. Pedile: **"Leé CLAUDE.md y docs/fases/fase-0.md y proponeme el plan de la fase 0."**
5. Debatí el plan y, cuando esté bien, decile "dale". Claude Code va a usar los subagentes de `.claude/agents/` según `docs/agentes.md`.
6. Ante decisiones grandes de diseño o dudas, va a parar y preguntarte. Las respuestas quedan en `docs/decisiones.md`.

## Contenido

| Ruta | Qué es |
|---|---|
| `CLAUDE.md` | contexto y reglas de trabajo (las lee Claude Code siempre) |
| `docs/arquitectura.md` | diseño completo: stack, datos, permisos, IA, MCP, almacenamiento |
| `docs/decisiones.md` | registro de lo que decidiste y por qué |
| `docs/fases/` | alcance y criterios de aceptación de las fases 0, 1, 1b, 2, 3, 4 y 5 |
| `docs/agentes.md` | reparto del trabajo entre subagentes |
| `.claude/agents/` | definiciones de los subagentes `db`, `core`, `web` y `revisor` |
| `fixtures/` | catálogo LCD 7023, caso de prueba y resultados esperados |
| `referencia/mi-plan-de-estudio/` | app original de tu hermana (sin sus credenciales), solo como referencia local (no se sube) |
| `LICENSE` | AGPL-3.0 |

Para el README final del repo (lo arma Claude Code en la fase 0): incluir el crédito "Basado en *Mi Plan de Estudio*, de [nombre de tu hermana]".
