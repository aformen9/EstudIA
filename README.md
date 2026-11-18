# EstudIA

App para estudiantes universitarios: plan de estudios, notas, correlativas y material de estudio por materia. Empieza con la Licenciatura en Ciencias de Datos de la UCA (plan 7023).

Basado en _Mi Plan de Estudio_, de Lucía Formenti.

- **En línea:** https://estudia-liard.vercel.app
- **Licencia:** [AGPL-3.0](LICENSE)

## Qué hace hoy (fase 0)

- Entrar con Google y elegir universidad, carrera y plan.
- Cargar la carrera con una grilla rápida o importando un respaldo de _Mi Plan de Estudio_.
- Ver aprobadas, en curso, finales, materias por cursar, correlativas, "podés cursar" y promedios con y sin aplazos, con las mismas reglas que SIU Guaraní.
- Cargar cada materia por instancias de evaluación: parciales, recuperatorios, cursadas, finales y promoción.
- Guardar material por materia: links y notas en la nube, y archivos en el dispositivo con vista previa.
- Modo claro y oscuro, instalable como PWA.

Lo que viene está en [`docs/backlog.md`](docs/backlog.md) y [`docs/fases/`](docs/fases/).

## Stack

pnpm workspaces · TypeScript estricto · React + Vite · Supabase (Postgres con RLS y Auth con Google) · Vitest · pgTAP · GitHub Actions · Vercel.

```
apps/web/          app React (PWA)
packages/core/     lógica de dominio pura, con tests: cálculos, correlativas, importadores
supabase/          migraciones, seed del catálogo y tests de RLS (pgTAP)
scripts/           generador del seed
fixtures/          catálogo LCD 7023 y un caso de prueba con un alumno inventado
docs/              arquitectura, decisiones, fases, backlog y estado
```

La lógica de negocio vive solo en `packages/core`; la web la consume y nunca la duplica. El diseño completo está en [`docs/arquitectura.md`](docs/arquitectura.md).

## Correrlo en local

Requisitos: Node 22 o más nuevo, pnpm, Docker y la [CLI de Supabase](https://supabase.com/docs/guides/cli).

```sh
pnpm i
supabase start                 # levanta Postgres, Auth y la API en Docker, con migraciones y seed
cp apps/web/.env.example apps/web/.env.development.local
# completar VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY con lo que muestra `supabase status`
pnpm dev                       # http://localhost:5173
```

En desarrollo aparece el botón **"Entrar con el usuario de prueba"**, que usa el login por mail de la base local. No existe en el build de producción (hay un test que lo comprueba).

Para probar con datos: importar `fixtures/caso-prueba-legacy.json` (un alumno inventado). Inicio tiene que mostrar 26 de 50 materias y promedio 7,73.

### Variables de entorno

| Archivo | Para qué |
|---|---|
| `apps/web/.env.development.local` | `pnpm dev`, contra Supabase local |
| `apps/web/.env.local` | `pnpm build`, contra el proyecto remoto |

Las variables son `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`, más una opcional para el panel de visitas de `#admin` (ver `.env.example`). Son públicas por diseño: la seguridad la dan las políticas de RLS. Ningún `.env` se commitea, salvo `.env.example`.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm test` | tests de `core` y `web` (Vitest) |
| `pnpm lint` | ESLint y Prettier |
| `pnpm typecheck` | TypeScript en todos los paquetes |
| `pnpm build` | build de producción |
| `pnpm seed` | regenera `supabase/seed.sql` desde `fixtures/lcd-7023-catalogo.json` |
| `supabase db reset` | recrea la base local con migraciones y seed (**borra los datos locales**) |
| `supabase test db` | tests de RLS y permisos (pgTAP), contra la base local |
| `pnpm --filter web test:integracion` | flujo de punta a punta contra la base local |

La prueba de integración escribe en la base local: conviene correr `supabase db reset` antes y después.

## Hacerse admin

No hay pantalla para nombrar admins y la API no lo permite. Se hace una sola vez desde el SQL Editor del panel de Supabase, con el id del usuario (Authentication → Users). Es un dato, no un cambio de esquema: es la única excepción a la regla de tocar la base solo con migraciones.

```sql
update public.perfiles set es_admin = true where id = '<id-del-usuario>';
```

## Analítica

Visitas y algunos eventos con [Umami Cloud](https://umami.is) (plan gratis, sin cookies). El código está en `apps/web/src/analitica/analitica.ts`.

- Solo cuenta en producción y en el dominio `estudia-liard.vercel.app`: ni en `localhost` ni en las vistas previas de Vercel. Respeta Do Not Track.
- Eventos: los pasos del onboarding, importar un respaldo (ok o error) y reportar (problema o sugerencia). Nunca ids, mails, nombres ni datos de materias.
- **Si cambia el dominio**, hay que actualizarlo en el panel de Umami (el sitio) y en `UMAMI.dominio` de `analitica.ts`. Si no, deja de contar.

## Estado del servicio

- Página pública: https://stats.uptimerobot.com/pypY6ca17D
- Monitoreo con [UptimeRobot](https://uptimerobot.com) (plan gratis), cada 5 minutos y con aviso por mail a Agu:
  - **La web:** monitor HTTP de `https://estudia-liard.vercel.app`.
  - **Supabase:** monitor de palabra clave (busca `GoTrue`) sobre `/auth/v1/health?apikey=<publishable key>`. Un monitor HTTP común da 405, porque UptimeRobot pide con `HEAD` y ese endpoint no lo acepta. La publishable key es pública, así que puede ir en la URL. Comprueba el servicio de login de Supabase, no la base.
- En la app: link "Estado del servicio" al final del menú lateral y en la pantalla de entrada.
- En `#admin`, la tarjeta "Estado del servicio" lee UptimeRobot con la Edge Function `estado-servicio` (`supabase/functions/estado-servicio/`), solo para admins y con 5 minutos de cache. La clave de UptimeRobot (de solo lectura) es un secreto de Supabase y nunca va en el repo. Para cargarla o cambiarla, en tu Terminal (pide la clave sin mostrarla y no queda en el historial):

  ```sh
  read -rs UR_KEY && supabase secrets set UPTIMEROBOT_API_KEY="$UR_KEY" --remote && unset UR_KEY
  ```

- Desplegar la función (a mano por ahora, sin Docker): `supabase functions deploy estado-servicio --remote --use-api`. La lógica se prueba con `pnpm --filter @estudia/funciones test`.

## Seguridad y datos

- El repo es público. Nunca se commitean secretos ni datos reales de personas: los fixtures son de un alumno inventado. gitleaks revisa todo el historial en cada push.
- Cada alumno ve solo sus datos (RLS, con tests). Las notas nunca se comparten.
- Los archivos subidos quedan en el dispositivo del alumno. A la nube solo van links, notas y los metadatos del archivo.

## Créditos

Basado en _Mi Plan de Estudio_, de Lucía Formenti: la estética, las vistas y las reglas de cálculo vienen de su app.
