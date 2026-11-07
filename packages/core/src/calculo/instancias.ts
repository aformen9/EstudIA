import type { EstadoMateria, Instancia, Plan, ProgresoMateria, TipoInstancia } from "../tipos";

/** Tope de parciales y de recuperatorios por materia. */
export const MAXIMO_PARCIALES = 6;

const NOMBRES: Record<TipoInstancia, string> = {
  parcial: "Parcial",
  recuperatorio: "Recuperatorio",
  cursada: "Cursada",
  final: "Final",
  promocion: "Promoción",
};

export function nombreDeTipo(tipo: TipoInstancia): string {
  return NOMBRES[tipo];
}

export type GrupoInstancias = "todas" | "cursadas" | "parciales" | "finales";

const GRUPO_DE: Record<TipoInstancia, Exclude<GrupoInstancias, "todas">> = {
  cursada: "cursadas",
  parcial: "parciales",
  recuperatorio: "parciales",
  final: "finales",
  promocion: "finales",
};

/** Para los botones de arriba de la lista: los recuperatorios van con los parciales y la promoción con los finales. */
export function enGrupo(tipo: TipoInstancia, grupo: GrupoInstancias): boolean {
  return grupo === "todas" || GRUPO_DE[tipo] === grupo;
}

/** Por fecha y, con la misma fecha, en el orden en que se cargaron. */
export function ordenarInstancias<I extends Pick<Instancia, "fecha" | "orden">>(
  instancias: readonly I[],
): I[] {
  return [...instancias].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);
}

/**
 * El nombre de cada instancia: con una sola de su tipo, "Final"; con varias, "Final 1", "Final 2"…
 * por fecha. La promoción es única y nunca lleva número.
 */
export function etiquetasDeInstancias(instancias: readonly Instancia[]): Map<string, string> {
  const etiquetas = new Map<string, string>();
  const ordenadas = ordenarInstancias(instancias);
  for (const tipo of Object.keys(NOMBRES) as TipoInstancia[]) {
    const delTipo = ordenadas.filter((i) => i.tipo === tipo);
    delTipo.forEach((instancia, posicion) => {
      const numero = delTipo.length > 1 && tipo !== "promocion" ? ` ${posicion + 1}` : "";
      etiquetas.set(instancia.id, `${NOMBRES[tipo]}${numero}`);
    });
  }
  return etiquetas;
}

/** Lo que se deduce de las instancias y del estado. Nada de esto se guarda. */
export interface ResumenMateria {
  /** La nota de la materia: solo si está aprobada y hay una promoción o un final con nota. */
  nota: number | null;
  /** El final que se toma como aprobado: el último con nota, si la materia está aprobada. */
  finalAprobado: Instancia | null;
  promocion: Instancia | null;
  /** Finales con nota que no son el aprobado, por fecha. */
  aplazos: Instancia[];
  /** La última cursada por fecha. */
  cursadaVigente: Instancia | null;
  /** Las cursadas anteriores a la vigente: se recursó. */
  cursadasDesaprobadas: Instancia[];
  /** Aprobada con una nota menor a la de aprobación: se toma igual, con un aviso. */
  notaPorDebajoDeAprobacion: boolean;
}

export function resumirMateria(
  progreso: Pick<ProgresoMateria, "estado" | "instancias">,
  plan: Pick<Plan, "notaAprobacion">,
): ResumenMateria {
  const ordenadas = ordenarInstancias(progreso.instancias);
  const finalesConNota = ordenadas.filter((i) => i.tipo === "final" && i.nota != null);
  const promocion = ordenadas.filter((i) => i.tipo === "promocion").at(-1) ?? null;
  const cursadas = ordenadas.filter((i) => i.tipo === "cursada");
  const aprobada = progreso.estado === "aprobada";

  let nota: number | null = null;
  let finalAprobado: Instancia | null = null;
  let aplazos = finalesConNota;
  if (aprobada && promocion?.nota != null) {
    nota = promocion.nota;
  } else if (aprobada && finalesConNota.length > 0) {
    finalAprobado = finalesConNota.at(-1) ?? null;
    nota = finalAprobado?.nota ?? null;
    aplazos = finalesConNota.slice(0, -1);
  }
  return {
    nota,
    finalAprobado,
    promocion,
    aplazos,
    cursadaVigente: cursadas.at(-1) ?? null,
    cursadasDesaprobadas: cursadas.slice(0, -1),
    notaPorDebajoDeAprobacion: nota != null && nota < plan.notaAprobacion,
  };
}

export type SituacionInstancia =
  "aprobado" | "aplazo" | "ausente" | "programada" | "vigente" | "desaprobada" | null;

/**
 * Qué es cada instancia, para mostrarlo. `hoy` es "AAAA-MM-DD": sin nota y con fecha de hoy o futura
 * es "programada"; un final sin nota pasa a "ausente" recién cuando su fecha ya pasó.
 */
export function situacionDeInstancia(
  instancia: Instancia,
  resumen: ResumenMateria,
  hoy: string,
): SituacionInstancia {
  if (instancia.nota == null && instancia.fecha >= hoy) return "programada";
  if (instancia.tipo === "final") {
    if (instancia.nota == null) return "ausente";
    if (resumen.finalAprobado?.id === instancia.id) return "aprobado";
    if (resumen.aplazos.some((a) => a.id === instancia.id)) return "aplazo";
    return null;
  }
  if (instancia.tipo === "cursada") {
    return resumen.cursadaVigente?.id === instancia.id ? "vigente" : "desaprobada";
  }
  return null;
}

export interface InstanciaProgramada {
  materiaId: string;
  instancia: Instancia;
}

/** Sin nota y con fecha de hoy en adelante, de la más cercana a la más lejana: "Próximos exámenes". */
export function instanciasProgramadas(
  progreso: readonly ProgresoMateria[],
  hoy: string,
): InstanciaProgramada[] {
  const programadas = progreso.flatMap((fila) =>
    fila.instancias
      .filter((i) => i.nota == null && i.fecha >= hoy)
      .map((instancia) => ({ materiaId: fila.materiaId, instancia })),
  );
  return programadas.sort(
    (a, b) =>
      a.instancia.fecha.localeCompare(b.instancia.fecha) || a.instancia.orden - b.instancia.orden,
  );
}

const cuantas = (instancias: readonly Instancia[], tipo: TipoInstancia) =>
  instancias.filter((i) => i.tipo === tipo).length;

/** Por qué no se puede agregar una instancia de ese tipo, o null si se puede. */
export function motivoParaNoAgregar(
  instancias: readonly Instancia[],
  tipo: TipoInstancia,
): string | null {
  const parciales = cuantas(instancias, "parcial");
  const recuperatorios = cuantas(instancias, "recuperatorio");
  if (tipo === "parcial" && parciales >= MAXIMO_PARCIALES) {
    return `Ya hay ${MAXIMO_PARCIALES} parciales`;
  }
  if (tipo === "recuperatorio" && recuperatorios >= MAXIMO_PARCIALES) {
    return `Ya hay ${MAXIMO_PARCIALES} recuperatorios`;
  }
  if (tipo === "recuperatorio" && recuperatorios >= parciales) {
    return "No puede haber más recuperatorios que parciales";
  }
  if (tipo === "promocion" && cuantas(instancias, "promocion") > 0) return "Ya tiene promoción";
  return null;
}

/** Por qué no se puede quitar una instancia, o null si se puede. */
export function motivoParaNoQuitar(instancias: readonly Instancia[], id: string): string | null {
  const instancia = instancias.find((i) => i.id === id);
  if (
    instancia?.tipo === "parcial" &&
    cuantas(instancias, "recuperatorio") >= cuantas(instancias, "parcial")
  ) {
    return "Primero quitá un recuperatorio";
  }
  return null;
}

/** El orden para una instancia nueva: después de todas las de la materia. */
export function proximoOrden(instancias: readonly Instancia[]): number {
  return instancias.reduce((maximo, i) => Math.max(maximo, i.orden), -1) + 1;
}

/**
 * En "Falta final", un final con nota que aprueba sugiere pasar a Aprobada. Lo decide el alumno:
 * nunca cambia el estado solo.
 */
export function sugerirAprobada(
  estado: EstadoMateria,
  instancias: readonly Instancia[],
  plan: Pick<Plan, "notaAprobacion">,
): boolean {
  return (
    estado === "final" &&
    instancias.some((i) => i.tipo === "final" && i.nota != null && i.nota >= plan.notaAprobacion)
  );
}
