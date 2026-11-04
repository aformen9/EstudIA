import type { EstadoMateria, Plan, ProgresoMateria } from "../tipos";

type Escala = Pick<Plan, "notaMin" | "notaMax">;
type Aprobacion = Pick<Plan, "notaAprobacion">;

export type SugerenciaEstado =
  | { estado: "aprobada"; motivo: "nota-final"; mensaje: string }
  | { estado: "final"; motivo: "parciales"; mensaje: string };

export type ValoresEdicion = Pick<ProgresoMateria, "estado" | "p1" | "p2" | "rec" | "nota">;

export function notaEnEscala(nota: number, plan: Escala): boolean {
  return Number.isFinite(nota) && nota >= plan.notaMin && nota <= plan.notaMax;
}

/** Valores enteros de la escala del plan, de menor a mayor. */
export function notasDeEscala(plan: Escala): number[] {
  const notas: number[] = [];
  for (let nota = Math.ceil(plan.notaMin); nota <= plan.notaMax; nota++) notas.push(nota);
  return notas;
}

function aprueba(nota: number | null, plan: Aprobacion): nota is number {
  return nota != null && nota >= plan.notaAprobacion;
}

/** Sugerencia que se muestra al editar una materia. Null si no hay nada para sugerir. */
export function sugerirEstado(valores: ValoresEdicion, plan: Aprobacion): SugerenciaEstado | null {
  const { estado, p1, p2, rec, nota } = valores;
  if (aprueba(nota, plan) && estado !== "aprobada") {
    return {
      estado: "aprobada",
      motivo: "nota-final",
      mensaje: `Con nota final ${nota}, ¿la pasás a Aprobada?`,
    };
  }
  if (nota == null && estado === "cursando" && aprueba(p1, plan)) {
    if (aprueba(p2, plan) || aprueba(rec, plan)) {
      return {
        estado: "final",
        motivo: "parciales",
        mensaje: "Aprobaste los parciales: podés pasarla a Final pendiente.",
      };
    }
  }
  return null;
}

/**
 * Lo que el formulario completa solo al cambiar una nota, como la referencia: una nota final que
 * aprueba pasa la materia a `aprobada`; un examen que aprueba, si no hay nota final, además la copia.
 * Recibe los valores ya editados.
 */
export function alEditarNota(
  campo: "nota" | "notaFinalExamen",
  valores: Pick<ProgresoMateria, "estado" | "nota" | "notaFinalExamen">,
  plan: Aprobacion,
): { estado: EstadoMateria; nota: number | null } {
  const { estado, nota, notaFinalExamen } = valores;
  if (campo === "nota") return { estado: aprueba(nota, plan) ? "aprobada" : estado, nota };
  if (aprueba(notaFinalExamen, plan) && nota == null) {
    return { estado: "aprobada", nota: notaFinalExamen };
  }
  return { estado, nota };
}

/** Lee el campo de aplazos ("2, 3"): separa por coma, punto y coma o espacio y descarta lo que no entra en la escala. */
export function parsearAplazos(texto: string, plan: Escala): number[] {
  return texto
    .split(/[,;\s]+/)
    .filter((parte) => parte !== "")
    .map(Number)
    .filter((nota) => notaEnEscala(nota, plan));
}
