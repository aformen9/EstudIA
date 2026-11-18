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
}
