import type { Correlativa, DatosAlumno, DatosImportados, Materia, PlanCompleto } from "../tipos";

/** `ownerId` de las materias propias de una vista previa, que todavía no tienen dueño en la base. */
export const OWNER_VISTA_PREVIA = "vista-previa";

/**
 * Arma los `DatosAlumno` que quedarían después de aplicar una importación, para calcular sobre ellos
 * antes de guardar. Las materias propias usan su `clave` como id. Toma solo las materias del catálogo.
 */
export function datosAlumnoDesdeImportacion(
  plan: PlanCompleto,
  datos: DatosImportados,
): DatosAlumno {
  const catalogo = plan.materias.filter((m) => m.ownerId === null);
  const idsCatalogo = new Set(catalogo.map((m) => m.id));
  const ordenInicial = catalogo.reduce((max, m) => Math.max(max, m.orden), -1) + 1;

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
    ...plan.correlativas.filter((c) => idsCatalogo.has(c.materiaId)),
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
    materias: [...catalogo, ...propias],
    correlativas,
    progreso: datos.progreso,
    historial: datos.historial,
  };
}
