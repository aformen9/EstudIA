import type {
  BorradorMateriaPropia,
  CondicionCorrelativa,
  Materia,
  ParaCorrelativa,
  PlanCompleto,
} from "../tipos";

/** La condición que usa el formulario de la referencia para cada tipo de correlativa. */
export const CONDICION_PREDETERMINADA: Record<ParaCorrelativa, CondicionCorrelativa> = {
  cursar: "regular",
  rendir: "aprobada",
};

/** Una materia con sus correlativas, tal como están, listas para editar. */
export function borradorDeMateria(
  datos: Pick<PlanCompleto, "correlativas">,
  materia: Materia,
): BorradorMateriaPropia {
  return {
    codigo: materia.codigo,
    nombre: materia.nombre,
    anio: materia.anio,
    cuatrimestre: materia.cuatrimestre,
    tipo: materia.tipo,
    area: materia.area,
    requiereAnioCompletoParaCursar: materia.requiereAnioCompletoParaCursar,
    correlativas: datos.correlativas
      .filter((c) => c.materiaId === materia.id)
      .map(({ requiereId, para, condicion }) => ({ requiereId, para, condicion })),
  };
}

/**
 * Deja un borrador listo para guardar. Null si no tiene nombre. Las extras (año 0) no tienen
 * cuatrimestre. Saca lo que la base rechazaría: una correlativa a sí misma y una repetida para el
 * mismo `para`, de la que queda la primera. `materiaId` es null si la materia todavía no existe.
 */
export function normalizarBorrador(
  borrador: BorradorMateriaPropia,
  materiaId: string | null,
): BorradorMateriaPropia | null {
  const nombre = borrador.nombre.trim();
  if (!nombre) return null;
  const vistas = new Set<string>();
  const correlativas = borrador.correlativas.filter(({ requiereId, para }) => {
    const clave = JSON.stringify([requiereId, para]);
    if (requiereId === materiaId || vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
  return {
    ...borrador,
    nombre,
    cuatrimestre: borrador.anio === 0 ? null : borrador.cuatrimestre,
    correlativas,
  };
}
