# Fase 1b — Comunidades por materia y cierre de cuatrimestre

**Objetivo:** el material se comparte por materia entre todas las camadas, y la app mantiene los estados al día preguntando al cerrar cada cuatrimestre.

Prerrequisito: fase 1 aprobada.

## Alcance

### Compartir
- Al subir (o después), cada material tiene: **Privado / Compartir con la materia**, y si se comparte: **Con mi nombre / Anónimo** (elige el alumno, por archivo). Campo `periodo` (ej. "2025 · 2° cuatri") precargado con el cuatrimestre actual, editable.
- Compartir un archivo comparte su **texto** (vía `documentos`) y un link al original: el original vive en el Drive del autor → al compartir, la app da permiso de lectura "cualquiera con el link" a ese archivo **solo si el alumno acepta** (mostrar aviso claro). **Preguntar a Agu** si prefiere otra estrategia antes de implementar (ej. copia en Drive del que lo abre).
- Pestaña "Comunidad" en cada materia y en Materiales: material compartido accesible (`material_compartido`), agrupado por período, con autor o "Anónimo", búsqueda en texto.
- Botón "Denunciar" (motivo: no corresponde, contenido inapropiado, derechos de autor, spam). Con 3 denuncias se oculta solo. Panel de admin: denuncias, ocultar/restaurar/borrar.
- Términos de uso breves al compartir por primera vez (responsabilidad del contenido, retiro ante reclamos).
- Indicador en Inicio: "Hay N materiales nuevos en tus materias en curso".

### Duplicados al subir (`arquitectura.md` §7)
- Mismo `sha256`, compartido en esa misma materia y visible para el alumno: mostrar "Este archivo ya está en el material de la materia, ¿lo querés ver?" y llevarlo ahí, sin guardar nada nuevo.
- Mismo `sha256`, solo como privado de otro usuario: reutilizar en silencio; para el alumno aparece como subido por él, sin aviso.
- Casi duplicados: similitud de texto con `pg_trgm` contra el material compartido de la materia. Si se parece mucho, preguntar "¿Es el mismo?" con las opciones Ver / Subir igual. **El umbral se define y se prueba con PDFs reales en esta fase.**

### Cierre de cuatrimestre
- Según `planes.cierre_cuatrimestres`, al entrar después del cierre, la app pregunta por cada materia `cursando`: Regularicé · Promocioné · Aprobé el final · Quedé libre · La abandoné. Actualiza estado (+ historial con `fuente = 'manual'`), recalcula correlativas y muestra "Ya podés cursar: …".
- Si hay importador de Guaraní configurado, ofrecer revalidar contra Guaraní.
- Al pasar una materia a "En curso": mensaje "Se desbloqueó el material de la comunidad de X".

## Criterios de aceptación
1. Tests de RLS: alumno A comparte en materia M; B (cursando M) lo ve; C (M pendiente) no; B ve autor `null` si A eligió anónimo; nadie ve el `progreso` de otro.
2. Tres denuncias de usuarios distintos ocultan el material; el admin lo restaura.
3. Flujo completo con dos cuentas de prueba (capturas).
4. Simulando la fecha de cierre, el diálogo aparece, actualiza estados y "podés cursar" cambia según correlativas.
5. Nada compartido expone el `user_id` de un autor anónimo (revisar respuesta de la RPC en Network).
6. Ninguna vía devuelve el `sha256` de documentos ajenos, tampoco las detecciones de duplicados (tests de RLS).
7. Subir un archivo ya compartido en la materia y visible lleva al material existente sin crear filas; si solo existe como privado de otro, se reutiliza sin ningún aviso que delate que ya existía.
8. Con PDFs reales, un casi duplicado dispara "¿Es el mismo?", y tanto Ver como Subir igual funcionan. El umbral elegido queda registrado en `docs/decisiones.md`.
