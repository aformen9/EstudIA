import type { DatosAlumno, EstadoMateria, Materia, ProgresoMateria } from "../tipos";

export type ConteoEstados = Record<EstadoMateria, number>;

export interface ProgresoCarrera {
  /** Incluye las materias propias. */
  total: number;
  porEstado: ConteoEstados;
  /** Aprobadas / total, redondeado a entero. 0 si el plan está vacío. */
  porcentajeAprobado: number;
  /** (Aprobadas + final) / total, redondeado a entero. 0 si el plan está vacío. */
  porcentajeCursado: number;
}

export function progresoDe(datos: DatosAlumno, materiaId: string): ProgresoMateria | null {
  return datos.progreso.find((p) => p.materiaId === materiaId) ?? null;
}

/** Función de consulta de estado: las materias sin fila de progreso están `pendiente`. */
export function lectorDeEstados(datos: DatosAlumno): (materiaId: string) => EstadoMateria {
  const estados = new Map(datos.progreso.map((p) => [p.materiaId, p.estado]));
  return (materiaId) => estados.get(materiaId) ?? "pendiente";
}

export function estadoDe(datos: DatosAlumno, materiaId: string): EstadoMateria {
  return lectorDeEstados(datos)(materiaId);
}

export function materiasPorEstado(datos: DatosAlumno, estado: EstadoMateria): Materia[] {
  const estadoDeMateria = lectorDeEstados(datos);
  return datos.materias.filter((m) => estadoDeMateria(m.id) === estado);
}

export function conteoPorEstado(datos: DatosAlumno): ConteoEstados {
  const estadoDeMateria = lectorDeEstados(datos);
  const conteo: ConteoEstados = { pendiente: 0, cursando: 0, final: 0, aprobada: 0 };
  for (const materia of datos.materias) conteo[estadoDeMateria(materia.id)]++;
  return conteo;
}

export function progresoCarrera(datos: DatosAlumno): ProgresoCarrera {
  const porEstado = conteoPorEstado(datos);
  const total = datos.materias.length;
  const porcentaje = (cantidad: number) => (total ? Math.round((cantidad / total) * 100) : 0);
  return {
    total,
    porEstado,
    porcentajeAprobado: porcentaje(porEstado.aprobada),
    porcentajeCursado: porcentaje(porEstado.aprobada + porEstado.final),
  };
}
