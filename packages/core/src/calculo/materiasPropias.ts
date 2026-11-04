import type {
  BorradorCorrelativa,
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

/** Busca el camino más corto de un nodo hasta sí mismo. */
function caminoHastaSiMismo(inicio: string, sucesores: Map<string, Set<string>>): string[] | null {
  const anteriores = new Map<string, string>();
  const cola = [inicio];
  for (const nodo of cola) {
    for (const siguiente of sucesores.get(nodo) ?? []) {
      if (siguiente === inicio) {
        const camino = [nodo];
        while (camino[0] !== inicio) camino.unshift(anteriores.get(camino[0] as string) as string);
        return camino;
      }
      if (!anteriores.has(siguiente)) {
        anteriores.set(siguiente, nodo);
        cola.push(siguiente);
      }
    }
  }
  return null;
}

/**
 * Materias del ciclo que bloquearía a `materiaId` con estas correlativas, empezando por ella, o null
 * si se puede guardar. Las de `correlativas` reemplazan a las que hoy tiene la materia. Solo cuenta
 * un ciclo que pase por esa materia, y `materiaId` null (materia nueva) nunca forma uno, porque nadie
 * la requiere todavía. Como en `estadoCorrelativas`, se ignoran las correlativas a materias que no
 * están en el plan.
 *
 * Cada materia tiene dos etapas: `regular` depende de sus correlativas para cursar y `aprobada`, de
 * su etapa `regular` y de sus correlativas para rendir. Así, A pide B regular para cursar y B pide A
 * aprobada para rendir no es un bloqueo. La regla de año completo no se tiene en cuenta.
 */
export function cicloDeCorrelativas(
  datos: Pick<PlanCompleto, "materias" | "correlativas">,
  materiaId: string | null,
  correlativas: BorradorCorrelativa[],
): string[] | null {
  if (materiaId === null) return null;

  const existentes = new Set([materiaId, ...datos.materias.map((m) => m.id)]);
  const sucesores = new Map<string, Set<string>>();
  const unir = (desde: string, hasta: string) => {
    const destinos = sucesores.get(desde) ?? new Set<string>();
    destinos.add(hasta);
    sucesores.set(desde, destinos);
  };
  const nodo = (id: string, etapa: CondicionCorrelativa) => `${etapa}:${id}`;

  for (const id of existentes) unir(nodo(id, "aprobada"), nodo(id, "regular"));
  const todas = [
    ...datos.correlativas.filter((c) => c.materiaId !== materiaId),
    ...correlativas.map((c) => ({ ...c, materiaId })),
  ];
  for (const { materiaId: desde, requiereId, para, condicion } of todas) {
    if (!existentes.has(requiereId)) continue;
    unir(nodo(desde, para === "cursar" ? "regular" : "aprobada"), nodo(requiereId, condicion));
  }

  const camino =
    caminoHastaSiMismo(nodo(materiaId, "regular"), sucesores) ??
    caminoHastaSiMismo(nodo(materiaId, "aprobada"), sucesores);
  if (!camino) return null;
  return [...new Set(camino.map((n) => n.slice(n.indexOf(":") + 1)))];
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
