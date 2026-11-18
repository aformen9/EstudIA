# Backlog de EstudIA

Ideas y mejoras priorizadas. **Regla:** toda idea nueva entra acá, no en la fase en curso. Una fase solo cambia de alcance si Agu lo aprueba explícitamente.

Origen: revisión general del proyecto del 16/11/2026 (Agu aprobó todos los puntos).

## 1. Ahora: cerrar la fase 0 (alcance congelado)

No se suma nada más a la fase 0. Orden:

1. Mergear `fase-0/cambios-de-diseno` a `main` por Pull Request con squash, con el CI en verde.
2. Vincular Supabase remoto (`supabase link`, lo corre Agu), subir migraciones y seed del catálogo, repetir contra el remoto las pruebas de GRANT, `anon` y el pedido de 2 MB.
3. Deploy en Vercel. Agregar la URL en Supabase (URL Configuration) y en Google (orígenes autorizados).
4. Criterio 5: flujo manual con Google real, en Mac y en un celular real.
5. README real del repo (hoy es el del paquete de especificación), con el crédito a "Mi Plan de Estudio", de Lucía Formenti.
6. Revisión final del revisor y reporte ✅/❌.

## 2. Antes de abrir a los primeros usuarios

Chico, pero necesario para no perder datos ni quedar a ciegas.

**Primera tanda, apenas se cierre la fase 0** (pedido de Agu del 16/11/2026, tras probar el deploy). Un PR por punto:

- [x] **Botón de casita** junto al menú de tres líneas, que lleva a Inicio. (Solo en el celular.)
- [x] **Acento azul por defecto, fondos y textos neutros y selector de color de acento** en Ajustes (Azul, Rosa, Violeta, Verde, Naranja), con **modo oscuro por defecto** en la primera visita (si el alumno pasa a claro, se recuerda). Incluye logo, favicon e íconos de la PWA en azul y contraste AA de todas las opciones. Valores aprobados por Agu el 16/11/2026 (ver `docs/decisiones.md`).
- [x] **Pantalla de métricas para admin** (RPC `metricas_admin()`, solo totales) y **botón "Reportar un problema o sugerencia"** (tabla `reportes`: de 1 a 1000 caracteres y hasta 5 por alumno cada 24 horas corridas, controlado en la base, con tests).
- [x] **Analítica con Umami Cloud** (plan gratis; verificar el cupo antes de integrar): sin cookies ni datos personales, con eventos del onboarding. Agu crea la cuenta y pasa el ID del sitio.
- [x] **Monitoreo de caídas con UptimeRobot** (plan gratis): lo configura Agu con guía, para la web y la API de Supabase.

**Segunda tanda** (orden y PRs del 18/11/2026; invitar usuarios queda sin fecha: primero la prueba Agu). Al cerrarla, arranca la fase 1 por el importador del SIU.

1. [x] **Backups diarios**: funcionando desde el 18/11/2026 (PRs #18 a #21; guía en `docs/respaldos.md`). Falta solo la primera restauración de prueba a mano. La clave de age queda en la compu de Agu y en su gestor, sin pendrive.
2. [ ] **PR 1, infraestructura (sin pantallas):** rol de solo lectura `respaldos` para los respaldos (migración, tests y `scripts/respaldos/sacar-respaldo.sh`, que reemplaza a `supabase db dump`); Dependabot solo para las actions de GitHub (semanal y agrupado; npm solo con las alertas de seguridad); `pnpm audit --prod --audit-level high` en el CI.
3. [ ] **PR 2, datos del alumno:**
   - **Almacenamiento persistente**: pedir `navigator.storage.persist()` y avisar que los archivos viven solo en ese dispositivo hasta que llegue Drive. Safari puede borrar datos locales de sitios sin uso si la app no está instalada.
   - **Borrar mi cuenta y mis datos** desde Ajustes, con una Edge Function (borrar el usuario de Auth necesita la clave secreta, que no puede estar en el cliente). Resuelve B6 (documentos huérfanos). El diseño se aprueba antes de implementar.
4. [ ] **PR 3, errores y cabeceras:** **Sentry** (plan gratis, sin datos personales, solo en producción; dependencia nueva) y **CSP** en Vercel primero en modo *Report-Only*, con todos los hosts: Supabase, fotos de Google, Umami (`script-src https://cloud.umami.is`, `connect-src https://gateway.umami.is`, `frame-src https://cloud.umami.is` para el panel de `#admin`) y Sentry. La Edge Function `estado-servicio` está en el dominio de Supabase.
5. [ ] **PR 4, privacidad y CSP definitiva:** **política de privacidad y términos de uso** (borrador), al final, para describir lo que de verdad quedó (Google, Supabase, Umami, Sentry, borrado de cuenta), con un mail de contacto visible. Dónde están los datos: la base de Supabase en Canadá (Canada Central) y los respaldos cifrados en Backblaze B2, en la Unión Europea (EU Central). Tiene que decir que los datos de una cuenta borrada pueden seguir **hasta 6 meses en los respaldos** (retención 7 diarios, 4 semanales y 6 mensuales). En el mismo PR, la CSP pasa de *Report-Only* a obligatoria si no hubo reportes.

**El resto:**

- [x] **Proteger `main`**: ruleset con PR obligatorio y los tres chequeos del CI. (Hecho por Agu el 16/11/2026.)
- [ ] **Verificación en dos pasos** en GitHub, Supabase y Google. (Agu.)
- [ ] **Subir las migraciones y desplegar las Edge Functions desde GitHub Actions al mergear a `main`**, para no depender de que Agu lo haga a mano desde una rama (`supabase db push --remote` y `supabase functions deploy --remote --use-api`). Requiere un secreto en GitHub (token de acceso de Supabase y contraseña de la base) y decidir el orden con el deploy de Vercel: la migración tiene que llegar antes que el código que la usa. (Pedido de Agu del 16/11/2026.)
- [ ] **Exigir actions fijadas por commit** (Settings → Actions → General → "Require actions to be pinned to a full-length commit SHA"). En un PR aparte: antes, fijar por SHA todas las actions del CI actual (`ci.yml`: checkout, pnpm, setup-node, setup-cli) y comprobar que el CI siga en verde; recién después activar la opción. Dependabot puede mantener los SHA al día (ítem 2 de la segunda tanda). (Pedido de Agu del 18/11/2026.)
- [ ] **Login de Google en las vistas previas de Vercel**, para revisar los cambios visuales de un PR antes de mergear. Hoy solo funciona en el deploy de producción. Probablemente alcance con agregar en Supabase (URL Configuration → Redirect URLs) un comodín para las URLs de vista previa del proyecto; verificar si Google pide algo más. Ojo: las vistas previas usan la base de producción, así que se prueba con la cuenta real. (Pedido de Agu del 16/11/2026.)
- [ ] **Test automático de la caché de la vista previa**: que un PDF ya cacheado no se vuelva a procesar (`materiales/VistaPrevia.tsx`). En la fase 0 quedó con prueba manual.
- [ ] **Investigar por qué pgTAP no corre con `supabase test db --remote`**: falla con `function plan(integer) does not exist` (CLI v3.0.0), también fijando `set local search_path = "$user", public, extensions` en el test (se probó el 16/11/2026 y se sacó). La CLI instala pgTAP en `extensions` antes de correr y lo borra al terminar. Hipótesis a confirmar: el rol con el que entra la CLI al remoto no tiene `USAGE` sobre el esquema `extensions`. Mientras tanto, el remoto se verifica con `supabase/verificacion_remoto.sql` (solo lectura, en el SQL Editor). No volver a correr la herramienta contra producción sin el ok de Agu.
- [ ] **Prueba con usuarios**: Lucía y 4 o 5 compañeros de LCD. Observarlos usar la app y anotar acá lo que salga.

## 3. Fase 1, reordenada

El orden anterior era: SIU → IA → Drive y texto → comunidades. El nuevo prioriza lo que hace única a la app.

1. **Importador de SIU Guaraní** (PDF y XLS), con la guía "¿Cómo consigo el archivo?" con capturas. Detecta el plan desde el archivo. Requiere que Agu baje su Historia Académica real (fuera del repo).
2. **Comunidad por materia** (antes fase 1b): compartir material, denuncias, casi duplicados, cierre de cuatrimestre. Revisar la opción de dejar los aportes compartidos como anónimos cuando alguien borra su cuenta, en lugar de borrarlos (hoy desaparecen para todos; pedido de Agu del 18/11/2026). Sembrarla con material de Agu y de Lucía para que no arranque vacía. Bloquear ejecutables al compartir.
3. **Drive + texto en la nube**: originales en el Drive del alumno, extracción de texto (PDF, .docx, .pptx, .txt, imágenes con OCR).
4. **Onboarding con IA y clave propia**: último, porque es el de más fricción. La app tiene que ser excelente sin IA.

Antes de empezar la fase 1:

- **Verificación de Google**: averiguar qué exige sacar la app del modo "prueba" (límite de usuarios, política de privacidad, dominio propio, vencimiento de sesiones) y cómo afecta al permiso de Drive.
- **Tests de navegador en el repo**: reconsiderar Playwright (incluye el motor de Safari, que nunca se probó). Dependencia nueva: aprobar antes.

## 4. Decisiones a revertir o simplificar

Aprobadas por Agu el 16/11/2026. Se aplican al arrancar la fase 1, no ahora.

- **Deduplicación**: pasar de global a **solo lo compartido**. Lo privado guarda su propio texto por alumno. Elimina casi todos los bloqueantes de fase 1 ligados al hash (texto falso, tipos falsos, oráculo de existencia, documentos huérfanos, parte de la cuota). Se mantiene: nunca exponer el hash de documentos ajenos.
- **Materias propias sin correlativas**: quitar la edición de correlativas en materias propias (ciclos, restauración, duplicados). Proponer cómo migrar las que ya existan antes de tocar nada.

## 5. Funciones nuevas (después de tener usuarios)

- **Planificador de cuatrimestres**: "si curso estas materias, ¿qué se me habilita y cuándo me recibo?". Usa la lógica de correlativas que ya existe.
- **Fechas desde EVA (iCal)**: importar entregas y exámenes; se muestran junto a las instancias "Programadas" en "Próximos exámenes".
- **Efectos reducidos automáticos** en dispositivos de gama baja.
- **Navegación inferior en el celular**, en lugar del menú lateral (evaluar con usuarios).
- **Slider de notas**: validar con usuarios; si la mayoría carga enteros, volver a botones.
- **Gráficos a pedido** con el asistente (fase 2).
- **Dominio propio** (costo nuevo: aprobar antes). También ayuda a la verificación de Google.
- **Página pública de presentación**: qué es EstudIA y cómo empezar, antes del login.
- **Vista previa al compartir el link** (Open Graph): título, descripción e imagen.
- **Invitar compañeros**: compartir un link a la app desde adentro.
- **Aviso de novedades**: qué cambió desde la última vez que entró el alumno.

## 6. Postergado hasta que haya demanda

- Apps descargables (dmg, exe, APK) y landing de descargas: la PWA cubre lo mismo sin firmas.
- IA local embebida y en el celular.
- MCP para Claude y ChatGPT.
- Moderadores por carrera y otras carreras (Ingeniería Química).

## 7. Forma de trabajo

- Decisiones menores: las toma la coordinadora y las informa. Solo se consulta lo de diseño grande.
- Agu hace a mano, para aprender y poder defenderlo: el job de backups, el deploy en Vercel y la protección de ramas.
