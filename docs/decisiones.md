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
- RPC `activar_plan` (inscribe si hace falta y deja ese plan como único activo) y RPC `reemplazar_datos_del_plan` (reemplazo todo o nada al importar).
- `materias.codigo` admite null solo en materias propias. Como mucho una inscripción activa por alumno.
- `docs/arquitectura.md` se actualiza al cerrar cada paso, para que siga siendo la fuente de verdad.
- Logo: **la E hecha de nodos conectados** (remite a las correlativas y a la constelación del fondo).
- Commits con el mail `noreply` de GitHub, configurado solo en este repo, para no publicar el mail personal.
- Crédito del README: "Basado en Mi Plan de Estudio, de Lucía Formenti".
- Repo fuera de iCloud, en `~/Projects/EstudIA`: la sincronización desalojaba archivos y hacía fallar los tests por timeout.
- El respaldo nuevo guarda las siglas de universidad y carrera, para no aceptar uno de otra carrera con la misma versión de plan.
- Un respaldo legacy sin ningún código en común con el plan se bloquea con un mensaje claro, en vez de crear todo como materias propias.
- Restaurar materiales agrega los que no existan (mismo título y url, o mismo `sha256`) sin borrar nada. Si complica, en la fase 0 se pueden omitir.
- Hash de documentos: en la fase 0, ninguna RPC ni consulta devuelve el `sha256` de documentos ajenos. ~~La solución de fondo queda como pendiente bloqueante de la fase 1 (`arquitectura.md` §12): preguntarle a Agu antes de elegir.~~ Resuelto el 2026-11-04, ver abajo.
- Push al remoto recién cuando esté el CI.

## 2026-11-03 (cierre de `db` en la fase 0)

- `material_compartido` no devuelve el `id` del documento: con ese `id` se podría crear un material propio y leer la fila completa, hash incluido.
- Criterio 6 de la fase 0: pasa a ser "ninguna clave real en el repo", porque `service_role` también es un nombre de rol de Postgres y no un secreto. Se agrega **gitleaks** al CI (dependencia aprobada).
- No se puede borrar un plan con inscripciones (`ON DELETE RESTRICT`, con test). Sin estado "archivado" por ahora.
- Los criterios que `db` aplicó por su cuenta quedan todos y pasan a la arquitectura: escrituras solo sobre planes o materias visibles, correlativas solo dentro del mismo plan y sin que una del catálogo dependa de una propia, reimportar pisa los datos de la materia propia reutilizada, y `documentos` sin excepción de lectura para admin.
- RLS `historial`: exige lo mismo que `progreso` (materia de un plan inscripto o materia propia), con test. Reemplaza el criterio de `db`, que no pedía inscripción.
- No se puede borrar una materia del catálogo que tenga progreso o historial (trigger, con test), porque se borrarían en cascada los datos de sus alumnos. Las materias propias se siguen borrando normal.
- Restaurar materiales también omite notas con el mismo título y texto, y conserva `periodo` y `createdAt`.
- Durante el desarrollo de `web` se usa Supabase local con un login de prueba que solo existe en `import.meta.env.DEV`, con un test que confirma que no llega al build de producción. Supabase remoto y Google los crea Agu más adelante.
- El CI y el primer push se adelantan: van antes de `web` y no al final de la fase, con gitleaks sobre todo el historial antes de pushear.
- El proyecto remoto de Supabase se crea con "Automatically expose new tables" desactivado. `supabase/config.toml` usa lo mismo (`auto_expose_new_tables = false`) y `08_grants.test.sql` fija la lista exacta de GRANT: todo objeto nuevo necesita el suyo, y `anon` no recibe nada.
- Proyecto remoto de Supabase creado por Agu en la región Américas, con Google configurado. Sus datos van en `apps/web/.env.local` y el stack local en `.env.development.local`, para que `pnpm dev` siga contra local. No se vincula ni se migra hasta cerrar `web`: ahí Agu corre `supabase link` y, después de subir las migraciones, se repite contra el remoto la prueba de GRANT y de `anon` por API real.

## 2026-11-04 (hash de documentos)

- Deduplicación **global** por `sha256`, para privados y compartidos. Resuelve el pendiente bloqueante de la fase 1 y acepta que quien ya tenga el hash de un documento pueda leer su texto.
- Ningún usuario puede obtener el `sha256` de documentos ajenos por ninguna vía. Se mantienen los tests de la fase 0.
- Al subir un archivo que ya existe: si está compartido en esa misma materia y el alumno puede verlo, se muestra "Este archivo ya está en el material de la materia, ¿lo querés ver?" y se lo lleva ahí, sin guardar nada nuevo. Si solo existe como privado de otro usuario, se reutiliza en silencio y para el alumno aparece como subido por él.
- Fase 1b: casi duplicados por similitud de texto (`pg_trgm`) contra el material compartido de la materia. Si se parece mucho, se pregunta "¿Es el mismo?" con las opciones Ver / Subir igual. El umbral se define y se prueba con PDFs reales en esa fase.

## 2026-11-04 (dudas de la tanda 1 de `web`)

- Onboarding automático y obligatorio para todo alumno sin inscripción activa.
- Ajustes es la vista `#ajustes`; el popover queda solo como atajo.
- Contraste: se ajusta la paleta para llegar a AA, con capturas antes y después del botón primario en claro y oscuro.
- Cerrar sesión cierra solo este dispositivo.
- Las fuentes se alojan en el repo en la tanda 4 de `web`, para que el navegador del alumno no se conecte a Google por ellas.
- Texto falso en documentos: queda en `arquitectura.md` §12 como bloqueante de la fase 1.
- La IA y el MCP tratan todo texto de documentos y material como datos no confiables, nunca como instrucciones (defensa contra prompt injection), con tests cuando lleguen esas fases.

## 2026-11-04 (dudas de la tanda 2 de `web`)

- Inicio sin datos cargados muestra los accesos "Cargar materias" e "Importar respaldo", para que recargar en el último paso del onboarding no deje al alumno trabado.
- Salir de la grilla con filas que fallaron avisa antes: "N materias no se guardaron", con las opciones Reintentar y Salir igual.
- Menú durante el onboarding: queda oculto, solo con tema y cerrar sesión, y el botón dice "Cerrar sesión" mientras dure.
- Catálogo vacío: el alumno ve un mensaje y puede cerrar sesión. Se retoma cuando se puedan cargar planes nuevos.
- Resultado de restaurar materiales: si el respaldo trae materiales, se muestra la cuenta y se espera "Ir a Inicio"; si no trae, va directo.

## 2026-11-04 (dudas de la tanda 3 de `web`)

- Inicio y el contador del menú muestran solo los materiales del plan activo y los "sin materia". Los de otro plan vuelven a verse al cambiar de plan.
- Los accesos de Inicio desaparecen cuando el alumno marca una materia, aunque la vuelva a poner en Pendiente. El panel y Ajustes cubren ese caso.
- Durante todo el onboarding el menú queda oculto, también en el paso 4, y "Cerrar sesión" cierra directo, sin popover.
- Inicio sin datos muestra el Inicio completo más los accesos.
- Reintentar con éxito en el aviso de la grilla termina de salir, porque el alumno ya había pedido salir.
- Recargar o cerrar la pestaña con filas que fallaron muestra el aviso nativo del navegador (`beforeunload`). Salir por el menú no avisa: alcanza con el indicador de guardado.
- El guardado tiene un tiempo máximo: nunca queda en "Terminando de guardar…"; pasa a "No se pudo guardar", con reintentar.
- La lógica que quedó en `web` pasa a `packages/core`, con sus tests.
- El nombre completo de la carrera se ve en escritorio, con tooltip o en dos líneas.
- El peso del JS se revisa al cerrar `web`.

## 2026-11-04 (panel de materia, tanda 4 de `web`)

- Correlativas en ciclo entre materias propias: no se guardan, y se explica qué materias forman el ciclo.
- Al editar correlativas, las ya marcadas conservan su condición; las nuevas usan la predeterminada (cursar: regular; rendir: aprobada).
- Notas en el panel: selector de enteros, como la referencia. Una nota guardada con decimales aparece como opción extra y se conserva. Desde el panel no se cargan decimales nuevos.
- Cuando haya carreras con decimales, el selector debería salir de la escala del plan, con un "paso" de nota (queda abierto en `arquitectura.md` §12).
- El bloqueo por ciclos solo mira los que pasan por la materia editada. Un ciclo importado impide guardarla hasta sacarlo. Puede bloquear de más con promociones y no mira la regla de año completo.
- La vista Materiales filtra igual que Inicio y el contador: plan activo y "sin materia".
- Crear y borrar materias propias entra en la tanda 4.
- Seguridad de Materiales: links solo `http` y `https`, archivos locales separados por usuario, y un HTML o SVG subido no se abre dentro de la app.
