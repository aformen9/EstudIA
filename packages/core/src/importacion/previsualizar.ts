import type { Correlativa, DatosAlumno, DatosImportados, Materia, PlanCompleto } from "../tipos";

/** `ownerId` de las materias propias de una vista previa, que todavía no tienen dueño en la base. */
export const OWNER_VISTA_PREVIA = "vista-previa";

/**
 * Las materias propias que siguen existiendo después de importar: `reemplazar_datos_del_plan` conserva
 * las que no vienen en el archivo. Usa su misma regla: mismo código o, sin código, mismo nombre.
 */
export function materiasPropiasConservadas(plan: PlanCompleto, datos: DatosImportados): Materia[] {
  return plan.materias.filter(
    (materia) =>
      materia.ownerId !== null &&
      !datos.materiasPropias.some((importada) =>
        importada.codigo === null
          ? materia.codigo === null && materia.nombre === importada.nombre
          : materia.codigo === importada.codigo,
      ),
  );
}

/**
 * Arma los `DatosAlumno` que quedarían después de aplicar una importación, para calcular sobre ellos
 * antes de guardar. Las materias propias del archivo usan su `clave` como id. Las propias que no
 * vienen en el archivo se conservan, sin progreso ni historial porque esos se reemplazan.
 */
export function datosAlumnoDesdeImportacion(
  plan: PlanCompleto,
  datos: DatosImportados,
): DatosAlumno {
  const catalogo = plan.materias.filter((m) => m.ownerId === null);
  const conservadas = materiasPropiasConservadas(plan, datos);
  const idsQueSiguen = new Set([...catalogo, ...conservadas].map((m) => m.id));
  const ordenInicial =
    [...catalogo, ...conservadas].reduce((max, m) => Math.max(max, m.orden), -1) + 1;

  const propias = datos.materiasPropias.map((materia, i): Materia => ({
    id: materia.clave,
    planId: plan.plan.id,
    codigo: materia.codigo,
    nombre: materia.nombre,
    anio: materia.anio,
    cuatrimestre: materia.cuatrimestre,
    tipo: materia.tipo,
    area: materia.area,
    requiereAnioCompletoParaCursar: materia.requiereAnioCompletoParaCursar,
    ownerId: OWNER_VISTA_PREVIA,
    orden: ordenInicial + i,
  }));
  const correlativas: Correlativa[] = [
    ...plan.correlativas.filter((c) => idsQueSiguen.has(c.materiaId)),
    ...datos.materiasPropias.flatMap((materia) =>
      materia.correlativas.map(({ requiere, para, condicion }) => ({
        materiaId: materia.clave,
        requiereId: requiere,
        para,
        condicion,
      })),
    ),
  ];

  return {
    plan: plan.plan,
    universidadSigla: plan.universidadSigla,
    carreraSigla: plan.carreraSigla,
    carreraNombre: plan.carreraNombre,
    materias: [...catalogo, ...conservadas, ...propias],
    correlativas,
    progreso: datos.progreso,
    historial: datos.historial,
  };
}
