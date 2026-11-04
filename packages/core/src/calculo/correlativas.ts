import type {
  CondicionCorrelativa,
  DatosAlumno,
  EstadoMateria,
  Materia,
  ParaCorrelativa,
} from "../tipos";
import { lectorDeEstados } from "./estados";

/** Una condición de la materia, con su estado actual, para que la UI la muestre. */
export interface RequisitoCorrelativa {
  materia: Materia;
  condicion: CondicionCorrelativa;
  cumple: boolean;
}

/** Regla de año completo: solo aparece "para cursar". */
export interface ModuloAnioCompleto {
  anio: number;
  /** Materias de ese año que todavía no están aprobadas. */
  pendientes: Materia[];
}

export interface EstadoCorrelativas {
  /** Todas las condiciones a materias existentes, en el orden de `datos.correlativas`. */
  requisitos: RequisitoCorrelativa[];
  /** Las condiciones no cumplidas. */
  faltan: RequisitoCorrelativa[];
  modulo: ModuloAnioCompleto | null;
  /** Requisitos sin cumplir: `faltan` más 1 si queda algo del año completo. */
  n: number;
  ok: boolean;
  /** La materia no tiene requisitos de este tipo. */
  vacio: boolean;
}

export interface AlertaAnioCompleto {
  /** Año de la primera materia pendiente con la regla (el que queda bloqueado). */
  anioBloqueado: number;
  /** Año que hay que tener completo. */
  anioRequerido: number;
  /** Materias de ese año que faltan aprobar. */
  pendientes: Materia[];
}

export interface SituacionCorrelativas {
  para: ParaCorrelativa;
  ok: boolean;
  /** Requisitos sin cumplir. */
  n: number;
}

/** `regular` se cumple con la cursada aprobada; `aprobada`, solo con la materia aprobada. */
export function cumpleCondicion(estado: EstadoMateria, condicion: CondicionCorrelativa): boolean {
  return condicion === "regular"
    ? estado === "final" || estado === "aprobada"
    : estado === "aprobada";
}

export function estadoCorrelativas(
  datos: DatosAlumno,
  materia: Materia,
  para: ParaCorrelativa,
): EstadoCorrelativas {
  const estadoDeMateria = lectorDeEstados(datos);
  const materiasPorId = new Map(datos.materias.map((m) => [m.id, m]));

  const requisitos = datos.correlativas.flatMap((correlativa) => {
    if (correlativa.materiaId !== materia.id || correlativa.para !== para) return [];
    const requerida = materiasPorId.get(correlativa.requiereId);
    if (!requerida) return [];
    return [
      {
        materia: requerida,
        condicion: correlativa.condicion,
        cumple: cumpleCondicion(estadoDeMateria(requerida.id), correlativa.condicion),
      },
    ];
  });
  const faltan = requisitos.filter((r) => !r.cumple);

  const anioRequerido = para === "cursar" ? materia.requiereAnioCompletoParaCursar : null;
  const modulo = anioRequerido
    ? {
        anio: anioRequerido,
        pendientes: datos.materias.filter(
          (m) => m.anio === anioRequerido && estadoDeMateria(m.id) !== "aprobada",
        ),
      }
    : null;

  const n = faltan.length + (modulo && modulo.pendientes.length ? 1 : 0);
  return { requisitos, faltan, modulo, n, ok: n === 0, vacio: !requisitos.length && !modulo };
}

/** Materias `pendiente` con todas sus condiciones para cursar cumplidas. */
export function podesCursar(datos: DatosAlumno): Materia[] {
  const estadoDeMateria = lectorDeEstados(datos);
  return datos.materias.filter(
    (m) => estadoDeMateria(m.id) === "pendiente" && estadoCorrelativas(datos, m, "cursar").ok,
  );
}

/** Materias `pendiente` a las que todavía les falta algo para cursar. */
export function materiasBloqueadas(datos: DatosAlumno): Materia[] {
  const estadoDeMateria = lectorDeEstados(datos);
  return datos.materias.filter(
    (m) => estadoDeMateria(m.id) === "pendiente" && !estadoCorrelativas(datos, m, "cursar").ok,
  );
}

/**
 * Lo que la fila de una materia avisa sobre sus correlativas, como `rowHTML` de la referencia. Una
 * pendiente mira las de cursar; una en curso o con final pendiente, las de rendir. Null si no hay
 * nada que avisar: aprobada, sin requisitos o en curso con todo cumplido para rendir.
 */
export function situacionCorrelativas(
  datos: DatosAlumno,
  materia: Materia,
): SituacionCorrelativas | null {
  const estado = lectorDeEstados(datos)(materia.id);
  if (estado === "aprobada") return null;
  const para: ParaCorrelativa = estado === "pendiente" ? "cursar" : "rendir";
  const { vacio, ok, n } = estadoCorrelativas(datos, materia, para);
  if (vacio || (estado === "cursando" && ok)) return null;
  return { para, ok, n };
}

/**
 * Alerta de Inicio: mira la primera materia pendiente con regla de año completo y devuelve lo que
 * le falta. Null si no hay ninguna o si a esa materia no le falta nada.
 */
export function alertaAnioCompleto(datos: DatosAlumno): AlertaAnioCompleto | null {
  const estadoDeMateria = lectorDeEstados(datos);
  const bloqueada = datos.materias.find(
    (m) => m.requiereAnioCompletoParaCursar && estadoDeMateria(m.id) === "pendiente",
  );
  if (!bloqueada) return null;
  const { modulo } = estadoCorrelativas(datos, bloqueada, "cursar");
  if (!modulo || !modulo.pendientes.length) return null;
  return {
    anioBloqueado: bloqueada.anio,
    anioRequerido: modulo.anio,
    pendientes: modulo.pendientes,
  };
}
