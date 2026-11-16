import type { Plan } from "../tipos";

export type EscalaConPaso = Pick<Plan, "notaMin" | "notaMax" | "notaPaso">;

/** Evita arrastrar el error de coma flotante: 7,1 + 0,1 tiene que dar 7,2. */
function limpiar(valor: number): number {
  return Math.round(valor * 1e6) / 1e6;
}

function limitar(valor: number, plan: EscalaConPaso): number {
  return Math.min(plan.notaMax, Math.max(plan.notaMin, valor));
}

/** El múltiplo del paso más cercano, dentro de la escala. */
export function ajustarAlPaso(valor: number, plan: EscalaConPaso): number {
  return limitar(limpiar(Math.round(valor / plan.notaPaso) * plan.notaPaso), plan);
}

/**
 * Un paso hacia arriba o abajo. Un valor fuera del paso, como un 7,25 importado, va al siguiente
 * múltiplo en esa dirección. Sin nota, arranca en la nota de aprobación.
 */
export function notaAUnPaso(
  valor: number | null,
  direccion: 1 | -1,
  plan: EscalaConPaso & Pick<Plan, "notaAprobacion">,
): number {
  if (valor == null) return plan.notaAprobacion;
  const pasos = limpiar(valor / plan.notaPaso);
  const siguiente = Number.isInteger(pasos)
    ? pasos + direccion
    : direccion > 0
      ? Math.ceil(pasos)
      : Math.floor(pasos);
  return limitar(limpiar(siguiente * plan.notaPaso), plan);
}

/** Un punto entero hacia arriba o abajo, conservando los decimales: de 8,5 a 9,5. */
export function notaAUnEntero(
  valor: number | null,
  direccion: 1 | -1,
  plan: EscalaConPaso & Pick<Plan, "notaAprobacion">,
): number {
  if (valor == null) return plan.notaAprobacion;
  return limitar(limpiar(valor + direccion), plan);
}

/** Fracción de cada tramo entre dos enteros que se lleva el imán, repartida a cada lado del entero. */
const IMAN_POR_LADO = 0.15;

/**
 * La nota para una posición del riel, de 0 a 1. Imán: los enteros ocupan más lugar y los valores
 * intermedios comparten el resto, así caer en un 7 es fácil y un 7,1 se puede alcanzar igual.
 */
export function notaEnPosicion(posicion: number, plan: EscalaConPaso): number {
  const acotada = Math.min(1, Math.max(0, posicion));
  const crudo = plan.notaMin + acotada * (plan.notaMax - plan.notaMin);
  const intermedios = Math.round(1 / plan.notaPaso) - 1;
  if (intermedios < 1) return ajustarAlPaso(crudo, plan);
  const entero = Math.floor(crudo);
  const resto = crudo - entero;
  if (resto < IMAN_POR_LADO) return limitar(entero, plan);
  if (resto >= 1 - IMAN_POR_LADO) return limitar(entero + 1, plan);
  const proporcion = (resto - IMAN_POR_LADO) / (1 - 2 * IMAN_POR_LADO);
  const indice = Math.min(intermedios - 1, Math.floor(proporcion * intermedios));
  return limitar(limpiar(entero + (indice + 1) * plan.notaPaso), plan);
}

/** La posición del riel para una nota, de 0 a 1. */
export function posicionDeNota(nota: number, plan: EscalaConPaso): number {
  return (limitar(nota, plan) - plan.notaMin) / (plan.notaMax - plan.notaMin);
}

export type NotaEscrita = { tipo: "vacia" } | { tipo: "invalida" } | { tipo: "ok"; valor: number };

/** Lee lo que escribe el alumno: coma o punto, redondeado al paso. Fuera de escala es inválida. */
export function leerNotaEscrita(texto: string, plan: EscalaConPaso): NotaEscrita {
  const limpio = texto.trim().replace(",", ".");
  if (!limpio) return { tipo: "vacia" };
  const valor = Number(limpio);
  if (!Number.isFinite(valor) || valor < plan.notaMin || valor > plan.notaMax) {
    return { tipo: "invalida" };
  }
  return { tipo: "ok", valor: ajustarAlPaso(valor, plan) };
}

/** Una nota con coma decimal, como se muestra en la app: "8,5". */
export function notaConComa(nota: number): string {
  return String(limpiar(nota)).replace(".", ",");
}
