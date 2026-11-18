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

**Segunda tanda, antes de invitar usuarios** (orden aprobado por Agu el 16/11/2026):

1. [ ] **Backups diarios**: job de GitHub Actions con volcado cifrado de la base. Van primero para proteger los datos desde el primer alumno; además evitan que Supabase pause el proyecto por inactividad. (Lo hace Agu a mano, con guía.)
2. [ ] **Dependabot** y `pnpm audit` en el CI.
3. [ ] **Almacenamiento persistente**: pedir `navigator.storage.persist()` y avisar que los archivos viven solo en ese dispositivo hasta que llegue Drive. Safari puede borrar datos locales de sitios sin uso si la app no está instalada.
4. [ ] **Registro de errores con Sentry** (plan gratis, sin datos personales, solo en producción). Dependencia nueva: aprobar antes.
5. [ ] **Cabeceras de seguridad (CSP)** en Vercel, con todos los hosts ya conocidos: Supabase, fotos de Google, Umami y Sentry. Umami: `script-src https://cloud.umami.is` y `connect-src https://gateway.umami.is` (adonde manda los datos el script, según su código del 17/11/2026; confirmarlo al armar la CSP).
6. [ ] **Borrar mi cuenta y mis datos** desde Ajustes. Decisión de diseño a proponer antes de implementar: borrar el usuario de Auth necesita un permiso que no puede estar en el cliente (probablemente una Edge Function), y resuelve B6 (documentos huérfanos).
7. [ ] **Política de privacidad y términos de uso** (borrador): al final, para describir lo que de verdad quedó (Google, Supabase, Umami, Sentry, borrado de cuenta). Necesita un mail de contacto visible.

**El resto:**

- [x] **Proteger `main`**: ruleset con PR obligatorio y los tres chequeos del CI. (Hecho por Agu el 16/11/2026.)
- [ ] **Verificación en dos pasos** en GitHub, Supabase y Google. (Agu.)
- [ ] **Subir las migraciones al remoto desde GitHub Actions al mergear a `main`**, para no depender de que Agu las suba a mano desde una rama. Requiere un secreto en GitHub (token de acceso de Supabase y contraseña de la base) y decidir el orden con el deploy de Vercel: la migración tiene que llegar antes que el código que la usa. (Pedido de Agu del 16/11/2026.)
- [ ] **Login de Google en las vistas previas de Vercel**, para revisar los cambios visuales de un PR antes de mergear. Hoy solo funciona en el deploy de producción. Probablemente alcance con agregar en Supabase (URL Configuration → Redirect URLs) un comodín para las URLs de vista previa del proyecto; verificar si Google pide algo más. Ojo: las vistas previas usan la base de producción, así que se prueba con la cuenta real. (Pedido de Agu del 16/11/2026.)
- [ ] **Test automático de la caché de la vista previa**: que un PDF ya cacheado no se vuelva a procesar (`materiales/VistaPrevia.tsx`). En la fase 0 quedó con prueba manual.
- [ ] **Investigar por qué pgTAP no corre con `supabase test db --remote`**: falla con `function plan(integer) does not exist` (CLI v3.0.0), también fijando `set local search_path = "$user", public, extensions` en el test (se probó el 16/11/2026 y se sacó). La CLI instala pgTAP en `extensions` antes de correr y lo borra al terminar. Hipótesis a confirmar: el rol con el que entra la CLI al remoto no tiene `USAGE` sobre el esquema `extensions`. Mientras tanto, el remoto se verifica con `supabase/verificacion_remoto.sql` (solo lectura, en el SQL Editor). No volver a correr la herramienta contra producción sin el ok de Agu.
- [ ] **Prueba con usuarios**: Lucía y 4 o 5 compañeros de LCD. Observarlos usar la app y anotar acá lo que salga.

## 3. Fase 1, reordenada

El orden anterior era: SIU → IA → Drive y texto → comunidades. El nuevo prioriza lo que hace única a la app.

1. **Importador de SIU Guaraní** (PDF y XLS), con la guía "¿Cómo consigo el archivo?" con capturas. Detecta el plan desde el archivo. Requiere que Agu baje su Historia Académica real (fuera del repo).
2. **Comunidad por materia** (antes fase 1b): compartir material, denuncias, casi duplicados, cierre de cuatrimestre. Sembrarla con material de Agu y de Lucía para que no arranque vacía. Bloquear ejecutables al compartir.
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
