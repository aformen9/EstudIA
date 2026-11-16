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
- ~~Orden de fases: 0 → 1 → 1b → 2 → 3 → 4 → 5 (ver `docs/fases/`).~~ Cambiado el 2026-11-16: la 1b entra en la fase 1 y las fases 3, 4 y 5 se postergan.
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

- ~~Deduplicación **global** por `sha256`, para privados y compartidos. Resuelve el pendiente bloqueante de la fase 1 y acepta que quien ya tenga el hash de un documento pueda leer su texto.~~ Reemplazada el 2026-11-16: la deduplicación es solo de lo compartido.
- Ningún usuario puede obtener el `sha256` de documentos ajenos por ninguna vía. Se mantienen los tests de la fase 0.
- Al subir un archivo que ya existe: si está compartido en esa misma materia y el alumno puede verlo, se muestra "Este archivo ya está en el material de la materia, ¿lo querés ver?" y se lo lleva ahí, sin guardar nada nuevo. ~~Si solo existe como privado de otro usuario, se reutiliza en silencio y para el alumno aparece como subido por él.~~ (Sin efecto desde el 2026-11-16: lo privado ya no se deduplica.)
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
- ~~Notas en el panel: selector de enteros, como la referencia. Una nota guardada con decimales aparece como opción extra y se conserva. Desde el panel no se cargan decimales nuevos.~~ Reemplazada por el slider del 2026-11-07, con decimales según el paso del plan.
- ~~Cuando haya carreras con decimales, el selector debería salir de la escala del plan, con un "paso" de nota (queda abierto en `arquitectura.md` §12).~~ Resuelta el 2026-11-07: se implementa ya.
- El bloqueo por ciclos solo mira los que pasan por la materia editada. Un ciclo importado impide guardarla hasta sacarlo. Puede bloquear de más con promociones y no mira la regla de año completo.
- La vista Materiales filtra igual que Inicio y el contador: plan activo y "sin materia".
- Crear y borrar materias propias entra en la tanda 4.
- Seguridad de Materiales: links solo `http` y `https`, archivos locales separados por usuario, y un HTML o SVG subido no se abre dentro de la app.
- Cerrar sesión no borra los archivos locales por defecto. El diálogo suma una casilla desmarcada, "Borrar también mis archivos de este dispositivo", con el aviso de que en la fase 0 no se pueden recuperar. La casilla borra solo los archivos del usuario que cierra sesión.
- Durante el onboarding, el diálogo de cerrar sesión aparece solo si el usuario tiene archivos en este dispositivo; si no, cierra directo.
- `.codex/` y `AGENTS.md` no se suben al repo: quedan en `.gitignore`.
- Avatar: en todos los lugares se usa la foto de la cuenta de Google (`user_metadata.avatar_url` o `picture`), con `referrerpolicy="no-referrer"`. Sin foto o si falla la carga, se muestra la inicial.
- Brillo que sigue al cursor en la grilla del onboarding: se conserva pero fluido, a 60 fps, medido antes y después. Si en listas largas no se puede, se desactiva solo ahí.

## 2026-11-05 (revisión de `db` y `core`, y cierre de la tanda 4)

- Antes de `supabase link` se arreglan cuatro hallazgos del revisor: A1, M1, M4 y B7. Los demás quedan anotados en `arquitectura.md` §12.
- A1: `registrar_documento` tiene límites en el servidor, configurables: unos 2 MB de texto por documento y una cuota de unos 50 MB por usuario, con test y un mensaje claro al alumno si los supera.
- M1: una materia no puede cambiar de dueño ni de plan, para que nadie eluda el trigger de borrado.
- M4: una materia propia del respaldo nunca se reutiliza dos veces al restaurar, así dos materias con igual código o nombre no se fusionan ni rompen la importación.
- B7: la base rechaza links que no sean `http` o `https`, y no acepta fechas futuras en un material.
- Materias y materiales se crean con un id de idempotencia generado en el cliente: un reintento después de un timeout no duplica.
- Dudas de `web`: un ciclo importado no impide guardar notas, solo cambiar correlativas. La casilla de cerrar sesión se oculta si no hay archivos. Si `avatar_url` no sirve, se prueba con `picture`. El resto queda como lo dejó `web`: cambiar de plan no borra datos, fuentes variables, año y cuatrimestre editables en materias propias, y el manejo de filas fallidas.
- Fuentes: se recortan al subset `latin`. El peso del JS se baja en esta tanda.
- Un material puede estar en varias materias: ~~"Mover a otra materia" y~~ "Agregar también a…" (otra referencia al mismo documento, sin duplicar archivo ni copia local). "Mover" se saca por la decisión del 2026-11-07.
- Al mover un material compartido, pasa a privado en la materia nueva. La copia local se borra solo si ninguna otra referencia del usuario la usa.
- Borrar un material es inmediato en pantalla, con "Deshacer" en un aviso de unos 8 s; el borrado real ocurre al vencer. Reemplaza al doble toque.
- En el panel de materia, los materiales se separan visualmente del formulario.
- El informe de SIU Guaraní queda en `docs/investigacion/siu-guarani.md`. Sus decisiones siguen abiertas para la fase 1.
- Cuota de A1: cuenta el texto más 1 KB por documento, se cobra aunque el documento ya exista (para no revelarlo) y borrar un material no devuelve cuota.
- También se arreglan antes de `supabase link`:
  - B1: una materia no cambia de plan (mismo trigger que M1).
  - B3: sin cascadas entre universidad, carrera y plan, también en pendientes.
  - B8: un material no cambia de `user_id`.
  - B10 y B11: se completan los tests.
  - B12: `reemplazar_datos_del_plan` toma el mismo lock que `activar_plan`.
  - B13: el login por mail se apaga en el remoto (lo hace Agu en el panel; en local se mantiene para el login de prueba), `texto_tsv` se resuelve contra el tope de 1 MB, por ejemplo con un prefijo, y los códigos de materia se normalizan con `trim`.
- CI: se comprueba que el seed coincida con `fixtures/lcd-7023-catalogo.json`.
- Fechas de material: se frena el futuro y se aceptan fechas pasadas, así restaurar conserva las originales. Se agrega `materiales.compartido_en`, que fija siempre el servidor: se llena al pasar a compartido y se borra al volver a privado. `material_compartido` ordena por esa columna.
- Al restaurar, la identidad de un material incluye la materia: un material en A y en B vuelve en las dos, sin duplicar si se restaura otra vez. Un material movido después del respaldo reaparece en la materia vieja. Si una materia propia se borró después del respaldo, su material queda "sin materia" y aparece también en la materia recreada; queda documentado con un test de punta a punta.
- Crear una materia propia con sus correlativas es atómico, con la RPC `crear_materia_propia`: el reintento con el mismo id es seguro.
- Un link o una nota corregidos tras un timeout usan el mismo id y después se actualizan, como las materias. Materia nueva, orden del panel, modal de mover y agregar, y subida con timeout quedan como los dejó `web`.
- Correlativas con un ciclo nuevo: se guardan las notas y lo demás, y se rechazan solo las correlativas, con un mensaje claro. El panel queda abierto para corregirlas.
- Lo rechazado por un límite al restaurar va en un contador aparte de "Fallaron".
- Antes de `supabase link`: borrar un plan con materias propias se rechaza, también si su alumno se dio de baja. Topes en la base: título 200 caracteres, link 2048 caracteres y nota 50 KB.
- Restaurar ejecuta primero los borrados pendientes de Deshacer, para que un material por borrarse no cuente como existente.
- Salir de la página cancela los borrados pendientes. Lo decidió la coordinadora tras probar el botón Atrás en Chrome: al volver de la caché del navegador, el plazo vencido borraba el material sin poder deshacer.
- JS: `zod` se saca de la carga inicial con la entrada `@estudia/core/importacion`. Lo demás (`react-dom` y Supabase) se acepta para la fase 0 y se revisa antes de publicar.
- Para más adelante, en `arquitectura.md` §12: cuota que no vuelve y `extraido_con` (fase 1), y republicar para quedar primero (fase 1b).
- Bloqueantes de la fase 1: M2, B2, B5 y B6. Para la fase 1b: M3 (el autor no puede volver a compartir un contenido oculto y el admin puede suspenderle compartir) y B9 (el contador de denuncias se reinicia al restaurar). B4 queda como riesgo aceptado.

## 2026-11-07 (prueba manual en Safari)

- Fase 0, antes de cerrarla, ocho cambios de diseño. Se implementan después del dale de Agu a los mockups:
  - Onboarding como modal centrado con fondo blur, línea de pasos abajo clickeable para volver a pasos anteriores y botón sin relleno "Paso anterior" arriba.
  - Todos los paneles laterales pasan a modales centrados con fondo blur; en el celular ocupan casi toda la pantalla.
  - Selector de materias propio y reutilizable: agrupado por año, con buscador y con el estado bien visible (color e ícono).
  - Un mismo archivo en varias materias se muestra como una sola tarjeta, con las materias como etiquetas y opciones para quitar de una materia o agregar a otra.
  - Celebración al aprobar: overlay a pantalla completa con blur, confeti y detrás el texto "¡Felicitaciones! Aprobaste X", sin el recuadro blanco.
  - Tarjeta de Promedio: los 4 números del mismo tamaño y distribuidos a lo ancho.
  - Botón de iniciar sesión con menos movimiento al pasar el mouse.
  - Zona de subida que deje más claro que se pueden arrastrar archivos.
- Fase 1: importar la Historia Académica del SIU en **PDF y XLS** (resuelve la decisión 1 de `docs/investigacion/siu-guarani.md`), con una guía "¿Cómo consigo el archivo?" con capturas que aporta Agu. La dependencia para XLS sigue a decisión de Agu.
- ~~Fase 1: vista previa de la primera página del PDF en la tarjeta, generada en la misma pasada que la extracción de texto.~~ Adelantada a la fase 0, ver abajo.
- Fase 2: gráficos a pedido desde el asistente ("quiero ver tal cosa de mi carrera").

## 2026-11-07 (revisión de los mockups de la fase 0)

Agu aprobó las 9 decisiones de los mockups con dos ajustes y sumó pedidos. Sigue sin implementarse nada: espera su ok a la versión nueva de los mockups.

- Onboarding: se puede volver a los pasos anteriores con el plan ya activado. Otro plan se activa recién al confirmar, y lo cargado queda guardado en el plan anterior.
- Modales: tocar afuera no los cierra; se cierran con la X, Cancelar o Esc. El menú lateral del celular no cambia.
- **Ninguna lista nativa en la app:**
  - Materias: selector propio con grupo "En curso ahora" arriba de los años.
  - ~~Nota: fila de botones 1 a 10. El valor guardado con decimales aparece como opción extra y se conserva, como ya estaba decidido.~~ Reemplazada por el slider, ver abajo.
  - Año y cuatrimestre: botones de opción (segmented).
- Estados: en toda la app, "Pendiente" pasa a "Por cursar" y "Final pendiente" a "Falta final".
- Tarjeta de archivo:
  - ~~"Mover a otra materia"~~ se saca: agregar y quitar hacen lo mismo. Reemplaza esa parte de lo decidido el 2026-11-05.
  - Quitar la última etiqueta deja el archivo en "Sin materia", sin borrarlo.
  - "Borrar archivo" lo saca de todas las materias del plan activo, con un solo Deshacer. El aviso dice de cuántas materias se borró: "Borrado de 2 materias · Deshacer".
  - Solo se agrupan archivos: una nota o un link agregado a otra materia es una copia independiente. No cambia la base, y el contador del menú pasa a contar tarjetas.
- Celebración: muestra la nota si la materia tiene ("con un 9"). Sale solo al aprobar desde el panel de materia, no desde la grilla ni al importar.
- Imán: tope de 4 px en todos los botones primarios, no solo en el login.
- **Onboarding, elección de plan:** si la carrera tiene un solo plan, se saltea y se elige solo. Si tiene varios, se preselecciona el más reciente como "vigente", con la ayuda "¿No sabés cuál es? Figura en tu Historia Académica del Guaraní".
- **Onboarding, paso de carga:** después de la carrera ofrece "Importar desde SIU Guaraní" (en la fase 0 como "Próximamente", con el botón "¿Cómo consigo el archivo?" ya previsto en el diseño), "Cargar a mano" e "Importar respaldo de EstudIA".
- El importador del SIU es el primer punto de la fase 1.
- **Vista previa adelantada a la fase 0:** primera página del PDF y miniatura de imágenes en las tarjetas, generadas en el dispositivo y cacheadas localmente. La librería de PDF se carga solo al entrar a Materiales, sin sumar al peso inicial. Esto adelanta PDF.js, que estaba previsto para la fase 1.
- **Archivos:** se acepta cualquier tipo hasta 50 MB. Hay vista previa para PDF, imágenes (HEIC si se puede) y texto (`.txt`, `.md`, `.csv`, `.py`); el resto va con ícono por tipo y descarga. Nada fuera de esos tipos se abre adentro de la app.
- Fase 1: extraer texto de `.docx`, `.pptx`, `.txt` e imágenes (OCR).
- Fase 1b: bloquear ejecutables al compartir.
- **Nota con slider, en vez de botones:** escala y paso salen del plan (UCA: 1 a 10, paso 0,1). Número grande arriba que cambia en vivo, imán suave en los enteros, botones − y +, tocar el número permite escribirlo, botón "Sin nota" aparte. Teclado: flechas de a un paso y Shift+flechas de a 1; rol `slider` con `aria-valuetext` ("8,5").
- **Paso de nota del plan:** se implementa ya lo que estaba abierto en `arquitectura.md` §12, con 0,1 por defecto. Agu aprobó que toque la base y `core`: columna `planes.nota_paso` editando la migración original, `"paso"` en el fixture y el seed, y funciones en `core`. Las notas guardadas no se migran ni se redondean. La distribución de notas agrupa por la parte entera, y el cambio de estado por nota se aplica al soltar el slider.
- **Notas visibles por estado:** Por cursar, ninguna. En curso: Parcial 1, Parcial 2 y Recuperatorio. Falta final: Nota de cursada y Final. Aprobada: Nota final, Final y Nota de cursada. Una nota ya cargada se ve siempre, y hay un botón "Ver todas las notas".
- Plan "más reciente": por fecha de carga (`created_at`) y, si empatan, la versión más alta. No cambia la base.
- "¿Cómo consigo el archivo?" se ve desactivado en la fase 0.
- HEIC sin librería nueva: miniatura donde el navegador lo sepa leer; en los demás, ícono y descarga.
- `pdfjs-dist` aprobada (Apache-2.0), con carga diferida: se baja solo si en Materiales falta generar la vista previa de algún PDF.
- Abrir PDF, imágenes y texto sigue siendo en una pestaña nueva, sin visor nuevo. El texto se abre siempre como texto plano. SVG va con ícono y descarga. La vista previa va solo en las tarjetas de Materiales.

## 2026-11-07 (panel de materia por instancias de evaluación)

- El panel deja de tener notas fijas ("Nota final", parciales, recuperatorio, cursada). La materia arranca sin instancias y se agregan con "+ Agregar instancia": Parcial, Recuperatorio, Cursada, Final o Promoción. Cada una tiene solo nota y fecha (hoy al crearla, editable), con su slider y un botón para quitarla, ordenadas por fecha.
- Hasta 6 parciales y 6 recuperatorios, nunca más recuperatorios que parciales. Numeración por fecha: uno solo es "Parcial"; con dos o más, "Parcial 1", "Parcial 2"; igual con recuperatorios. Finales y cursadas, varias. Promoción, una sola.
- Las instancias no tienen estado: el estado es de la materia y lo elige el alumno. Se deduce:
  - Aprobada: el último final con nota es el aprobado y su nota es la de la materia; los anteriores con nota son aplazos. Con promoción, la nota es la de la promoción y los finales con nota son aplazos.
  - No aprobada: todos los finales con nota son aplazos.
  - Final sin nota con fecha pasada: ausente, no cuenta como aplazo. Sin nota con fecha de hoy o futura: "Programada", preparada para "Próximos exámenes".
  - Cursadas: la última por fecha es la vigente; las anteriores, desaprobadas.
  - Último final de una materia Aprobada con nota menor a la de aprobación: se toma igual como aprobado, con un aviso suave.
- En "Falta final", un final con nota que aprueba sugiere "¿La aprobaste? Pasar a Aprobada"; decide el alumno. Se sacan el cambio automático a Aprobada y la sugerencia de parciales aprobados.
- "En vivo": en el panel, lo calculado cambia al mover cada nota; el resto de la app se actualiza al Guardar.
- Fecha con el control nativo del navegador, estilado como el resto de la app.
- Base: tabla `instancias` (reemplaza a `historial`) y `progreso` queda solo con el estado. Se editan las migraciones originales y se resetea la base local. Promoción única en la base; los topes los controlan `core` y la pantalla.
- Importador legacy y respaldo v1: el historial pasa a instancias (Regularidad → cursada, Examen → final, Ausente → final sin nota, Promoción → promoción; "En curso" se descarta) y las notas sin evento se crean con la fecha del respaldo. Respaldo nuevo v2 con instancias. El fixture y los resultados esperados no cambian.
- Numeración también para cursadas y finales: con más de una del mismo tipo se llaman "Cursada 1", "Cursada 2", "Final 1", "Final 2", por fecha. La promoción, única, no lleva número.
- Arriba de las instancias, botones para ver Todas, Cursadas, Parciales (con los recuperatorios) o Finales (con la promoción).

## 2026-11-16 (revisión general del proyecto, `docs/backlog.md`)

Agu aprobó todos los puntos del backlog. Acá van las decisiones de sus secciones 3, 4, 6 y 7; el detalle y lo demás quedan en `docs/backlog.md`.

- **Fase 0 congelada:** no se suma nada más. Se cierra con los pasos de la sección 1 del backlog.
- **Toda idea nueva va a `docs/backlog.md`**, no a la fase en curso. Una fase cambia de alcance solo si Agu lo aprueba explícitamente.
- **Fase 1 reordenada** (antes: SIU → IA → Drive y texto; comunidades en la fase 1b). Orden nuevo, priorizando lo que hace única a la app:
  1. Importador de SIU Guaraní (PDF y XLS), con la guía "¿Cómo consigo el archivo?" con capturas. Detecta el plan desde el archivo. Requiere que Agu baje su Historia Académica real (fuera del repo).
  2. Comunidad por materia (lo que era la fase 1b): compartir material, denuncias, casi duplicados y cierre de cuatrimestre. Se siembra con material de Agu y de Lucía para que no arranque vacía. Ejecutables bloqueados al compartir.
  3. Drive y texto en la nube: originales en el Drive del alumno y extracción de texto (PDF, `.docx`, `.pptx`, `.txt`, imágenes con OCR).
  4. Onboarding con IA y clave propia, último por ser el de más fricción: la app tiene que ser excelente sin IA.
- La fase 1b deja de existir como fase aparte: su contenido pasa a ser el bloque 2 de la fase 1.
- **Antes de empezar la fase 1:** averiguar qué exige la verificación de Google para salir del modo "prueba" (límite de usuarios, política de privacidad, dominio propio, vencimiento de sesiones) y cómo afecta al permiso de Drive; y reconsiderar Playwright (incluye el motor de Safari). Playwright es una dependencia nueva: se aprueba antes.
- **Deduplicación: de global a solo lo compartido.** Lo privado guarda su propio texto por alumno. Se mantiene que nunca se expone el hash de documentos ajenos. Reemplaza la deduplicación global del 2026-11-04. Se aplica al arrancar la fase 1, no antes.
- **Materias propias sin correlativas:** se quita la edición de correlativas en materias propias (y con ella los ciclos, su restauración y sus duplicados). Antes de tocar nada se le propone a Agu cómo migrar las que ya existan. Se aplica al arrancar la fase 1, no antes.
- **Postergado hasta que haya demanda:** apps descargables (dmg, exe, APK) y landing de descargas (la PWA cubre lo mismo sin firmas), IA local embebida y en el celular, MCP para Claude y ChatGPT, moderadores por carrera y otras carreras (Ingeniería Química). Las fases 3, 4 y 5 quedan en pausa.
- **Forma de trabajo:** las decisiones menores las toma la coordinadora y las informa; solo se consulta lo de diseño grande.
- **Agu hace a mano**, para aprender y poder defenderlo: el job de backups, el deploy en Vercel y la protección de ramas. La coordinadora lo guía paso a paso.

## 2026-11-16 (cierre de la fase 0)

- Criterio 5 verificado a mano por Agu sobre el deploy (https://estudia-liard.vercel.app) con Google real: login, onboarding con el plan elegido solo, importar el fixture, 26 de 50 y 7,73, cambiar una nota y recargar, modo oscuro. Sin capturas, por decisión de Agu.
- Bug del menú lateral (borde superior del ítem activo cortado) se arregla dentro del cierre de la fase 0.
- Primera tanda después de cerrar la fase 0 (`docs/backlog.md` §2): botón de casita, acento azul por defecto con selector de acento en Ajustes (logo e íconos de la PWA en azul, contraste AA), Umami, métricas para admin, monitoreo de caídas y "Reportar un problema o sugerencia".
- Agu es el único autor de commits y PRs: se sacó `Co-Authored-By: Claude` de todo el historial de `main` (force push corrido por Agu).
- Criterio 5: ✅ verificado manualmente por Agu, sin capturas.
- Criterio 9: aceptado con la prueba manual de la caché de la vista previa; el test automático va al backlog.
- Crédito del README: Lucía Formenti está de acuerdo con que se la nombre.
- Agu protege `main` con un ruleset.
