# SIU Guaraní 3: qué puede exportar el alumno

Investigación para la fase 1 (§1.1). Consulta: 2026-11-04. Solo fuentes públicas: no se entró a ningún portal ni se vio un archivo real exportado. No es asesoramiento legal.

Etiquetas: **confirmada** (fuente oficial o varias coincidentes), **probable**, **sin confirmar**.

## Conclusión

- El alumno puede bajar **Historia Académica** y **Plan de Estudios** en **PDF o XLS** desde Reportes. **Confirmada** (doc oficial 3.18, 3.21 y 3.23, y varias universidades).
- No hay API para el alumno. La API REST oficial la configura cada institución, con usuarios del servidor. **Confirmada**.
- Lo que falta saber no se resuelve con documentación: **el SIU documenta las pantallas, pero no el contenido de los archivos**. No se sabe si el archivo de la UCA trae el código de materia (`GMA0212`), y de eso depende el match de la fase 1.
- La UCA usa SIU Guaraní. **Confirmada**. Que sea la versión 3 es **probable** (ninguna fuente lo dice).
- **Recomendación, para que decida Agu:** subir el archivo exportado y procesarlo en el navegador, con pantalla de revisión. Empezar por el PDF, salvo que la prueba con la cuenta de Agu muestre que el XLS es claramente mejor. Pedir la contraseña de Guaraní queda descartado.
- **Próximo paso:** Agu baja los archivos y revisa la lista de la sección "Qué tiene que probar Agu". Sin eso no conviene elegir formato ni escribir el parser.

## Exportaciones

Ruta oficial: Perfil Alumno >> Reportes >> [reporte].

| Exportación | Pantalla | Formato | Campos | Confianza |
|---|---|---|---|---|
| Historia Académica | Reportes > Historia Académica | PDF, XLS | En el archivo: Actividad, Fecha, Tipo, Nota, Resultado, con el código entre paréntesis después del nombre | Formatos: **confirmada**. Columnas: **probable** (solo un importador de terceros, probado con un PDF real de otra universidad) |
| Plan de Estudios | Reportes > Plan de Estudios | PDF, XLS | En pantalla: nombre y código, tipo, año y período de cursada, nota si está aprobada, origen, créditos, puntaje, correlativas con botón "Ver". En UTN-BA, además Propuesta, Plan y Versión | Formatos y pantalla: **confirmada**. Si las correlativas salen en el archivo: **sin confirmar** |
| Actuación Provisoria | Reportes > Actuación Provisoria | PDF, Excel | Propuesta, Actividad, Fecha de regularidad, Nota, Resultado, N° de Acta, Año Académico, Período Lectivo, Comisión (en exámenes, fecha y turno) | **Confirmada** (columnas de pantalla) |
| Constancias y certificados | Trámites > Solicitar Constancias y Certificados | PDF si la descarga es online; si no, retiro por ventanilla | Tipos posibles: alumno regular, actividades aprobadas, desaprobadas, rendidas por examen, promedio con y sin aplazos, examen final | **Confirmada** que depende de la institución. Contenido del PDF: **sin confirmar** |
| Mis Inscripciones | Reportes > Mis Inscripciones | Comprobante individual. UNICEN menciona también PDF y Excel del listado | Cursadas y exámenes, con estado de inscripción, sin notas | **Probable**. Sirve poco para importar |
| Regularidades | Reportes > Regularidades | PDF, Excel | Resultado, fecha de regularidad, vencimiento | **Sin confirmar** en la UCA: está en el manual de UNICEN, no en la doc oficial 3.21 |

Lo importante de Historia Académica:

- Tiene filtros (Cursadas, Exámenes, Reconocimientos) y consultas predefinidas, entre ellas **Historia completa**. **Confirmada**.
- Es probable que el archivo respete el filtro elegido. El importador de UTN-Tracker pide dejarlo en "Todos". **Probable**.
- Las notas aparecen recién **cuando se cierra el acta**. Hasta entonces están en Actuación Provisoria. **Confirmada**. Importar solo Historia Académica puede dejar afuera las notas más nuevas.
- "En curso" se ve solo durante el período lectivo. **Confirmada** en UTN-BA.
- La pantalla muestra promedios con y sin aplazos y porcentaje de aprobación. **Confirmada** en UNICEN y UNMdP. Si están en el archivo, sirven para cotejar el resultado: **sin confirmar**.

## Campos contra lo que necesita EstudIA

| Dato | En Historia Académica | En otro lado | Confianza | Nota para EstudIA |
|---|---|---|---|---|
| Código de materia | Entre paréntesis tras el nombre | Plan de Estudios | HA: **probable**. Plan: **confirmada**. **Formato UCA: sin confirmar** | El parser de UTN-Tracker espera dígitos; el catálogo LCD usa `GMA0212` |
| Nombre | Actividad | Plan | **Probable** | Puede partirse en dos líneas en el PDF |
| Nota | Nota | Plan (si está aprobada) | **Probable** | Revisar decimales y notas no numéricas |
| Fecha | `dd/mm/aaaa` | | **Probable** | Pasar a `date` |
| Tipo | Regularidad, Examen, Promoción, En curso | | **Probable** | Coincide con `historial.tipo` |
| Resultado | Aprobado, Reprobado, Ausente, Promocionado | | **Probable** | Coincide con `historial.resultado` |
| Aplazos | No hay columna: son filas de Examen reprobado | | **Probable** | Se derivan; Ausente no cuenta (§6) |
| Equivalencias | Pantalla: nota, fecha, resolución, temas a rendir, origen | | Pantalla: **confirmada** en UTN-BA. Archivo: **sin confirmar** | **`historial.tipo` no tiene valor para esto: requiere decisión de Agu** |
| Plan y versión | Quizá solo "Propuesta" en el encabezado | Plan de Estudios | HA: **sin confirmar**. Plan: **confirmada** en UTN-BA | Necesario para rechazar un archivo de otro plan |
| Parciales (`p1`, `p2`, `rec`) | Solo en el detalle desplegable | | Pantalla: **confirmada**. Archivo: **sin confirmar** | Pueden quedar vacíos |
| Libro, folio, acta, comisión | Detalle | | **Confirmada** en UTN-BA (pantalla) | No hacen falta: no guardarlos |
| Vencimiento de regularidad | No figura | Regularidades | **Sin confirmar** | El modelo no tiene el campo |

Los valores de tipo y resultado coinciden con los de `fixtures/caso-prueba-legacy.json`, y la app de referencia dice que su historial viene del SIU. Es un indicio a favor, no una prueba: su documentación no explica cómo se obtuvo. Conviene preguntarle a la autora.

## Variación entre universidades y versiones

- Las constancias disponibles dependen de la configuración de Gestión. **Confirmada** (oficial).
- Las optativas del plan dependen de un parámetro (`pro_ver_optativas_en_estrucutura_plan`). **Confirmada** (oficial).
- Los datos del plan cambian según cómo esté armado. **Confirmada** (oficial 3.18).
- Los menús cambian: UNICEN y UNMdP listan reportes que no están en la doc 3.21. **Confirmada**, aunque pueden ser manuales de versiones viejas.
- Los nombres de las constancias también: la UCA tiene opciones propias de cada facultad, y UTN-BA una de trabajos prácticos firmados. **Confirmada**.
- El sistema se personaliza: boletines del SIU de 2013 y 2014 hablan de personalizaciones institucionales, y el foro muestra que en Gestión la exportación a Excel se activa por cuadro. Que eso cambie los archivos de Autogestión entre instituciones es **probable**, no comprobado.
- La doc oficial llega al menos a 3.23 y las instituciones actualizan en momentos distintos. **Confirmada**. La descripción de Historia Académica es la misma en 3.18, 3.21 y 3.23.
- Consecuencia: **un parser hecho para la UCA no vale para toda Argentina sin probar**. Debería fallar con un mensaje claro si no reconoce el archivo.

### La UCA

- Usa SIU Guaraní: lo dicen un tutorial de Derecho Rosario, guías de Teología y la página de inscripción de Ingeniería. **Confirmada**.
- Guaraní 3: los menús del tutorial (Reportes, Trámites, Propuesta) coinciden con 3W, pero ninguna fuente nombra la versión. **Probable**.
- Portal: lo llaman **campus virtual** o Campus de Alumnos, y Guaraní se abre desde adentro. Aparecen dos direcciones: `campus.uca.edu.ar/Campus/` (Ciencias Sociales) y `autogestion.uca.edu.ar` (tutorial de Derecho Rosario, que parece de 2021, y guía de Teología 2024). Cuál está vigente: **sin confirmar**.
- Acceso con el **correo UCA**, y según el tutorial con la cuenta de Outlook. **Probable** que siga así.
- Teología dice que los alumnos ven su historia académica desde el campus. **Confirmada**, pero no hay instructivo de la UCA sobre descargarla. Que la UCA tenga los botones PDF y XLS: **probable**.
- Sobre Licenciatura en Ciencias de Datos en particular no se encontró nada.
- No se encontraron términos de uso públicos del campus. **Sin confirmar**.

## API e integración

| Vía | Para quién | Estado |
|---|---|---|
| API REST de Guaraní (`/rest/v1`, `/rest/v2`) | **Solo institución.** Los usuarios se declaran en archivos del servidor, con autenticación basic o digest | **Confirmada** |
| Swagger | Lo instala cada institución; pide credenciales | **Confirmada** (foro SIU). La especificación se publica en el portal de documentación |
| API-App (app móvil) | **Solo institución**: la instala en su servidor y el SIU la suma al catálogo. El alumno usa la app, con JWT contra 3W | **Confirmada**. Uso por terceros: la doc no lo menciona, no hay habilitación conocida |
| Autogestión web | El alumno, con su sesión | **Confirmada**. No se encontró API oficial para el alumno |

- Una integración real implicaría un **convenio con la UCA** (o cada universidad), que le dé un usuario de la API. No es para la fase 1. Si hay contacto con la UCA, vale preguntar.
- Antecedentes de terceros, ninguno oficial:
  - UTN-Tracker: importa el PDF en el navegador. Lo más parecido a lo que necesitamos. Antes de copiar código hay que revisar su licencia.
  - UniMCP y siu-notas: leen el HTML con la sesión del usuario. Avisan que un cambio de página puede romperlos o que corren bajo responsabilidad del usuario.
  - Extensiones de promedio: leen la pantalla.

## Aspectos legales y de términos

No es asesoramiento legal: antes de abrir a más alumnos, conviene que lo mire un abogado.

**Archivo que baja el propio alumno (riesgo bajo si se hace bien):**

- Notas y nombre son datos personales (art. 2). No figuran en la lista de datos sensibles.
- El alumno entrega sus propios datos: hace falta consentimiento informado (art. 5) e información previa clara sobre finalidad y destinatarios (art. 6).
- Solo datos necesarios (art. 4): procesar en el navegador, no subir ni guardar el original, descartar DNI, legajo y nombre, no loguear filas.
- Seguridad, secreto y derechos de acceso, rectificación y supresión (arts. 9, 10, 14 a 16). La fase 0 ya tiene RLS y descarga de respaldo; falta revisar si alcanza.
- **Puntos abiertos:**
  - Transferencia internacional (art. 12): `docs/arquitectura.md` no indica en qué país están los datos. Lo mismo si el archivo pasa por un proveedor de IA.
  - Registro de la base (art. 21): la ley lo pide a archivos públicos y privados destinados a dar informes. Si aplica a EstudIA: **sin confirmar**.
  - Política de privacidad: la búsqueda no la encontró en `docs/` ni en `apps/web/src`. Habría que redactarla.

**Acceso automatizado con credenciales (riesgo alto):**

- El art. 153 bis del Código Penal castiga el acceso a un sistema restringido sin autorización o excediéndola. Si el permiso del alumno alcanza cuando actúa un tercero, y si los términos de la universidad lo permiten, **no se pudo confirmar**. Esa duda ya es un riesgo.
- Sería EstudIA quien guarda y usa la credencial, con todas las obligaciones de seguridad y la responsabilidad si se filtra.

### Por qué no pedir la contraseña de Guaraní (descartado)

- En la UCA parece ser la **cuenta institucional completa** (Outlook), no solo Guaraní: mail y demás quedarían expuestos.
- Juntar contraseñas de alumnos hace de EstudIA un blanco, y el repo es público y lo mantiene una sola persona.
- Le enseña a los alumnos a dar su contraseña a terceros, lo que favorece el phishing.
- Es frágil: UniMCP reporta sesiones que vencen en minutos y no ofrece Guaraní en modo hosteado; siu-notas depende del HTML y de SSO con MFA.
- Es innecesario: el alumno ya puede bajar el mismo dato en dos clics.

## Opciones para la fase 1

| Opción | Ventajas | Riesgos | Evaluación |
|---|---|---|---|
| **A. Subir PDF de Historia Académica** (en el navegador) | Lo documentan todas las fuentes; PDF.js ya está previsto en §1.4; hay un antecedente funcionando; el original no sale del dispositivo | Parsear por posición es frágil (filas partidas, cambios de plantilla); falla con otra plantilla o si no tiene texto | **Recomendada para empezar** |
| **B. Subir XLS** | Si es una tabla real, es más simple y robusto | Dependencia nueva (decisión de Agu); no se sabe si es un `.xls` real ni qué columnas trae | **Candidata**: puede superar a A después de probar |
| **C. Pegar la tabla de la pantalla** | Sin dependencias; sirve si falla la descarga | Más pasos; la pantalla agrupa y despliega; probablemente sin códigos; variable según navegador | Plan B de bajo costo, si la prueba muestra que funciona |
| **D. IA con clave propia** (§1.2) | Tolera variaciones; sirve para otras universidades | Notas y nombre van a un proveedor externo; puede inventar datos; requiere clave | Complemento, no vía principal. Mandar el texto sin encabezado y siempre con tabla de revisión |
| **E. Extensión o bookmarklet** | Sin contraseña y con datos completos | Hay que publicarla y mantenerla; pide más confianza; se rompe si cambia el HTML; no anda bien en celular | No para la fase 1 |
| **F. Convenio y API institucional** | Datos oficiales y estables | Depende de cada universidad; plazo incierto | A futuro |
| **G. Automatizar con la contraseña** | | Ver arriba | **Descartada** |

### Recomendación

Para que Agu decida; no está decidido:

- **Implementar A**, con el parser separado de la lectura del archivo: PDF a filas, filas a `DatosImportados`. Así sumar B después no obliga a rehacer nada.
- **Cambiar a B** si la prueba muestra un XLS real con códigos y columnas limpias, aceptando la dependencia.
- **Reutilizar lo que ya hay:** previsualización con avisos, reemplazo con confirmación (`reemplazar_datos_del_plan`) y `fuente = 'siu'`.
- **Avisos en la pantalla de revisión:** archivo no reconocido, filas sin mapear y materias sin match.
- **Grilla manual como salida** si el archivo falla.
- **Plan de Estudios:** no hace falta para LCD (ya está en el catálogo). Sí podría servir para otras carreras, según qué exporte.

### Decisiones que le tocan a Agu

1. Formato inicial: PDF, XLS o ambos, después de la prueba.
2. Si el archivo no trae código: ¿match por nombre con revisión? Contradice "match por código" de la fase 1 y puede afectar el criterio 1 ("sin correcciones manuales").
3. Equivalencias: ¿nuevo `tipo` en `historial` (cambio de modelo) o se mapean a un tipo existente? UTN-Tracker las trata como aprobación.
4. Notas en acta abierta: ¿aceptar también Actuación Provisoria, avisar que pueden faltar o dejarlo para más adelante?
5. Importar el historial reemplaza los datos del plan. Reimportar pisaría las notas parciales cargadas a mano (`p1`, `p2`, `rec`), que el archivo probablemente no trae. ¿Se aceptan esa pérdida, o se conservan?
6. Si se quiere la consulta legal y la política de privacidad antes de abrir a más alumnos.

## Qué no se pudo confirmar y qué tiene que probar Agu

Nadie puede responder esto desde afuera. Con **tu propia cuenta**, desde una computadora (un instructivo visto en la búsqueda avisa que en el celular pueden faltar opciones; no se identificó cuál):

**Portal**

- [ ] Por dónde entrás hoy y cómo se llama el portal.
- [ ] Si se ve la versión de Guaraní (suele estar en el pie).
- [ ] Qué reportes aparecen, y si están Plan de Estudios, Actuación Provisoria y Regularidades.
- [ ] Qué constancias se ofrecen.

**Historia Académica: elegí "Historia completa" y bajá PDF y XLS**

- [ ] ¿Aparecen los dos botones? ¿Se baja bien? (UNL avisa de archivos guardados sin extensión.)
- [ ] ¿Se puede seleccionar el texto del PDF, o es una imagen?
- [ ] ¿Qué columnas trae y en qué orden? ¿Coincide con Actividad, Fecha, Tipo, Nota, Resultado?
- [ ] **¿Trae el código de materia (`GMA0212`) en cada fila?** Es la pregunta clave.
- [ ] ¿Cómo aparecen las filas de un aplazo, un ausente, una promoción, una cursada desaprobada, una en curso y una equivalencia, si tenés?
- [ ] ¿Dice carrera, plan y versión? ¿Qué datos personales tiene y dónde (nombre, DNI, legajo)?
- [ ] ¿Trae promedios y porcentaje?
- [ ] ¿El XLS es una planilla real? Abrila con un editor de texto: si ves HTML, es una tabla disfrazada. ¿Tiene más o menos datos que el PDF?
- [ ] ¿Qué pasa si bajás con otro filtro? ¿Cambia el contenido?

**Otros archivos**

- [ ] Plan de Estudios en PDF y XLS: ¿trae correlativas, plan y versión, optativas? ¿Coincide con `fixtures/lcd-7023-catalogo.json`?
- [ ] Actuación Provisoria: ¿tiene códigos? ¿Tiene algo que no esté en la historia?
- [ ] Copiar y pegar la tabla de la pantalla a un editor: ¿queda usable?

**Cuidado con los archivos reales (el repo es público)**

- [ ] Guardá los originales **fuera del repo**. Nunca los commitees, ni capturas de pantalla.
- [ ] No uses un original "tapado" como fixture: los PDF arrastran metadatos y el texto puede seguir debajo de lo que se tapa.
- [ ] Para el fixture, generá un archivo nuevo con la misma estructura y un alumno inventado: nombre, DNI y legajo falsos, y notas y fechas cambiadas.
- [ ] Si querés que lo revise el agente, pasale la **estructura** (encabezados y filas inventadas), no el archivo original.

**Otras limitaciones de esta investigación**

- Las páginas oficiales se leyeron con una herramienta que resume; los nombres de columnas conviene verificarlos contra la fuente.
- El sitio de documentación del SIU falló de forma intermitente. La especificación de la API (endpoints) no se pudo leer.
- Nada de lo oficial describe el contenido del archivo exportado.
- Las columnas del PDF salen de un proyecto de terceros, con otra universidad y una sola prueba real según su PR.

## Fuentes

Todas consultadas el 2026-11-04.

**SIU, oficial**

- [Reportes de Autogestión 3.23.0](https://documentacion.siu.edu.ar/wiki/SIU-Guarani/Version3.23.0/Documentacion_de_Autogestion/Reportes)
- [Reportes de Autogestión 3.21.0](https://documentacion.siu.edu.ar/wiki/SIU-Guarani/Version3.21.0/Documentacion_de_Autogestion/Reportes)
- [Reportes de Autogestión 3.18.0](https://documentacion.siu.edu.ar/wiki/SIU-Guarani/Version3.18.0/Documentacion_de_Autogestion/Reportes)
- [Solicitar constancias y certificados 3.21.0](https://documentacion.siu.edu.ar/wiki/SIU-Guarani/Version3.21.0/Documentacion_de_Autogestion/Solicitar_constancias_y_certificados)
- [API REST de Guaraní 3.22.0](https://documentacion.siu.edu.ar/wiki/SIU-Guarani/Version3.22.0/API_REST_GUARANI)
- [API-App](https://documentacion.siu.edu.ar/wiki/SIU-Guarani/API-App)
- [Catálogo de APIs](https://documentacion.siu.edu.ar/apis/?spec=guarani_v2)
- Foro SIU: [acceso a documentación de APIs](https://foro.comunidad.siu.edu.ar/t/acceso-a-documentacion-apis/24447), [uso de la API REST](https://foro.comunidad.siu.edu.ar/t/utilizacion-de-la-api-rest/29846), [exportar a Excel un cuadro](https://foro.comunidad.siu.edu.ar/t/agregar-boton-exportar-a-excel-para-un-cuadro/16851)
- Boletines Info SIU sobre personalizaciones: [marzo 2014](https://bibliotecadigital.cin.edu.ar/server/api/core/bitstreams/9bed26d5-8f18-46b2-b92f-5798df580b20/content), [noviembre 2013](https://bibliotecadigital.cin.edu.ar/server/api/core/bitstreams/2d9a33e0-eb7f-4993-868d-c96b9f077001/content)
- [Agenda del Taller Anual SIU 2025](https://portal.comunidad.siu.edu.ar/images/unmdp2025/comites/Agenda%20Comite%20SIU-Guarani%20-%20Taller%20Anual%20SIU%202025.pdf) (visto en resultados de búsqueda)

**UCA**

- [Tutoriales de campus virtual y SIU Guaraní, Derecho Rosario](https://wadmin.uca.edu.ar/public/ckeditor/Facultad%20de%20Derecho%20Rosario/Actualizaci%C3%B3n%20WEB%202021/Tutoriales%20y%20FAQs/1-%20Tutoriales%20Campus%20Virtual%20y%20SIU%20GUARANI.pdf)
- [Guía académica de Teología 2024](https://wadmin.uca.edu.ar/public/TEOLOGIA/Images/INTERIOR%20Final%20Ordo%202024.pdf)
- [Guía académica de Teología 2023](https://wadmin.uca.edu.ar/public/TEOLOGIA/Descargas/Ordo%202023.pdf) (visto en resultados de búsqueda)
- [Inscripción a materias, Ingeniería](https://uca.edu.ar/es/facultad-de-ingenieria-y-ciencias-agrarias/inscripcion-a-materias) (visto en resultados de búsqueda)
- [Campus virtual de alumnos, Ciencias Sociales](https://uca.edu.ar/es/facultad-de-ciencias-sociales/alumnos/campus-virtual-alumnos) (visto en resultados de búsqueda)

**Otras universidades**

- [UTN-BA: reporte de Historia Académica](https://docs.frba.utn.edu.ar/books/mu---guaran%C3%AD/page/reporte-de-historia-acad%C3%A9mica---alumnos)
- [UTN-BA: manual de Autogestión Alumnos](https://docs.frba.utn.edu.ar/books/mu---guaran%C3%AD/chapter/autogesti%C3%B3n-alumnos/export/pdf)
- [UNICEN, Arte: manual](https://www.arte.unicen.edu.ar/wp-content/uploads/2019/02/manual_siu_guarani.pdf)
- [UNMdP: manual Guaraní 3W](https://www.mdp.edu.ar/images/instructivo-siu/Manual_Guarani_Alumnos_UNMDP.pdf)
- [UNQ: Historia Académica](https://www.unq.edu.ar/wp-content/uploads/2024/02/Historia-Academica.pdf)
- [UNL, FIQ: instructivo](https://www.fiq.unl.edu.ar/academica/wp-content/uploads/sites/6/2020/12/Para-Alumnos.pdf)
- [UNLP, Económicas: instructivo](https://www.econo.unlp.edu.ar/frontend/media/89/28989/72571bb109768740f34173c79345e323.pdf)
- [UDE: manual 3.17](https://www.ude.edu.ar/wp-content/uploads/2021/03/siu-Manual-Autogesti%C3%B3n-alumno.pdf)
- [Instructivo Piazzolla, CABA](https://cmbsas-caba.infd.edu.ar/sitio/wp-content/uploads/2026/08/Instructivo-SIU-Guarani-Alumnos_PIAZZOLLA-1.pdf) (visto en resultados de búsqueda)

**Proyectos de terceros (no oficiales)**

- [UTN-Tracker, PR 62](https://github.com/Duplino/UTN-Tracker/pull/62), [siuImport.js](https://raw.githubusercontent.com/Duplino/UTN-Tracker/main/public_html/assets/js/siuImport.js), [tests](https://raw.githubusercontent.com/Duplino/UTN-Tracker/main/tests/js/siuImport.test.mjs)
- [UniMCP](https://github.com/HyNuwa/UniMCP)
- [siu-notas](https://github.com/juanitorres1/siu-notas)
- [siu-guarani-promedio-extension](https://github.com/juliancasaburi/siu-guarani-promedio-extension)

**Legal**

- [Ley 25.326, texto oficial](https://www.argentina.gob.ar/normativa/nacional/64790/texto)
- [Código Penal, art. 153 bis](https://stabogados.com.ar/penal/codigo-penal/parte-especial/arts-153-153bis-154-155-156-157-157bis) (fuente secundaria, visto en resultados de búsqueda; verificar en InfoLEG)
