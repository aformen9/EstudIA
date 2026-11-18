/** Embudo del onboarding: cada paso cuenta alumnos, no filas. */
export interface EmbudoOnboarding {
  registrados: number;
  eligieronCarrera: number;
  cargaronMaterias: number;
  /** Desde el 2026-11-17: las importaciones anteriores no quedaron registradas. */
  importaronRespaldo: number;
}

/** Totales para el admin (RPC `metricas_admin`): nunca datos de un alumno. */
export interface MetricasAdmin {
  alumnos: number;
  alumnosNuevos7Dias: number;
  alumnosConInscripcionActiva: number;
  alumnosConMaterias: number;
  /** Cargaron o modificaron algo: progreso, instancias, materias propias o material. */
  alumnosActivos7Dias: number;
  inscripcionesPorPlan: {
    universidad: string | null;
    carrera: string | null;
    plan: string;
    alumnos: number;
  }[];
  materiasConProgreso: number;
  instancias: number;
  materiasPropias: number;
  materiales: { archivo: number; link: number; nota: number };
  documentos: number;
  reportes: number;
  reportes7Dias: number;
  embudo: EmbudoOnboarding;
}

export interface PasoEmbudo {
  etiqueta: string;
  alumnos: number;
  /** Respecto de los registrados, redondeado; null si todavía no hay registrados. */
  porcentaje: number | null;
}

/** Los pasos del embudo en orden, con el porcentaje de cada uno respecto de los registrados. */
export function pasosEmbudo(embudo: EmbudoOnboarding): PasoEmbudo[] {
  const pasos: [string, number][] = [
    ["Se registraron", embudo.registrados],
    ["Eligieron carrera", embudo.eligieronCarrera],
    ["Cargaron al menos una materia", embudo.cargaronMaterias],
    ["Importaron un respaldo", embudo.importaronRespaldo],
  ];
  return pasos.map(([etiqueta, alumnos]) => ({
    etiqueta,
    alumnos,
    porcentaje: embudo.registrados > 0 ? Math.round((alumnos / embudo.registrados) * 100) : null,
  }));
}
