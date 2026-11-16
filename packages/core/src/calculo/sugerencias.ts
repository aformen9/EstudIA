import type { Plan } from "../tipos";

type Escala = Pick<Plan, "notaMin" | "notaMax">;

export function notaEnEscala(nota: number, plan: Escala): boolean {
  return Number.isFinite(nota) && nota >= plan.notaMin && nota <= plan.notaMax;
}

/** Valores enteros de la escala del plan, de menor a mayor. */
export function notasDeEscala(plan: Escala): number[] {
  const notas: number[] = [];
  for (let nota = Math.ceil(plan.notaMin); nota <= plan.notaMax; nota++) notas.push(nota);
  return notas;
}
