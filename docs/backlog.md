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

Chico, pero necesario para no perder datos ni quedar a ciegas:

- [ ] **Proteger `main`**: solo merge por Pull Request con CI en verde. (Lo hace Agu a mano.)
- [ ] **Backups**: job diario de GitHub Actions con volcado cifrado de la base. Además evita que el proyecto gratis de Supabase se pause por inactividad. (Lo hace Agu a mano.)
- [ ] **Verificación en dos pasos** en GitHub, Supabase y Google. (Agu.)
- [ ] **Almacenamiento persistente**: pedir `navigator.storage.persist()` y avisar al alumno que los archivos viven solo en ese dispositivo hasta que llegue Drive. Safari puede borrar datos locales de sitios sin uso si la app no está instalada.
- [ ] **Registro de errores** (Sentry, plan gratis). Dependencia nueva: aprobar antes.
- [ ] **Analítica con Umami**: sin cookies ni datos personales, con eventos del onboarding (en qué paso se abandona). Servicio nuevo: aprobar antes, incluido si va alojado o en la nube de Umami.
- [ ] **Pantalla de métricas para admin**: consultas a la base (alumnos, inscripciones, materias cargadas, materiales), solo para `es_admin`, sin exponer datos de alumnos individuales.
- [ ] **Monitoreo de caídas** (UptimeRobot o similar, plan gratis): aviso si la web o Supabase no responden.
- [ ] **Botón "Reportar un problema o sugerencia"**: a dónde llega (mail, issue de GitHub, tabla en la base) se decide antes de implementarlo.
- [ ] **Cabeceras de seguridad (CSP)** en Vercel, permitiendo los hosts de las fotos de Google.
- [ ] **Dependabot** y `pnpm audit` en el CI.
- [ ] **Política de privacidad y términos de uso** (borrador), con un mail de contacto visible.
- [ ] **Borrar mi cuenta y mis datos** desde Ajustes.
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
- **Color de acento elegible** (4 o 5 opciones con las variables CSS actuales).
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
