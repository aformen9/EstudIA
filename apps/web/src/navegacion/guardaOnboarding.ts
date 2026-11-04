import type { Vista } from "./rutas";

export type EstadoInscripcion = "cargando" | "error" | "ninguna" | "activa";

/**
 * Qué vista se muestra según el hash pedido. Null: todavía no se sabe, y no se muestra ninguna.
 * - Sin inscripción activa, siempre el onboarding.
 * - Con inscripción activa, `#onboarding` vuelve a Inicio, salvo que el alumno recién haya activado
 *   su plan y esté eligiendo cómo cargar sus materias (`enCurso`).
 */
export function resolverVista(
  pedida: Vista,
  inscripcion: EstadoInscripcion,
  enCurso: boolean,
): Vista | null {
  if (inscripcion === "cargando" || inscripcion === "error") return null;
  if (inscripcion === "ninguna") return "onboarding";
  return pedida === "onboarding" && !enCurso ? "inicio" : pedida;
}
