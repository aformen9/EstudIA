import type { Vista } from "./rutas";

export type EstadoInscripcion = "cargando" | "error" | "ninguna" | "activa";

/**
 * Qué vista se muestra según el hash pedido. Null: todavía no se sabe, y no se muestra ninguna.
 * - Sin inscripción activa, siempre el onboarding.
 * - `#admin` solo para admins; mientras no llega el perfil, ninguna.
 * - Con inscripción activa, `#onboarding` vuelve a Inicio, salvo que el alumno recién haya activado
 *   su plan y esté eligiendo cómo cargar sus materias (`enCurso`).
 */
export function resolverVista(
  pedida: Vista,
  inscripcion: EstadoInscripcion,
  enCurso: boolean,
  /** null: el perfil todavía no llegó. */
  esAdmin: boolean | null = false,
): Vista | null {
  if (inscripcion === "cargando" || inscripcion === "error") return null;
  if (inscripcion === "ninguna") return "onboarding";
  // #admin solo para admins: los demás caen en Inicio (y la base les rechaza las RPC igual).
  if (pedida === "admin") return esAdmin === null ? null : esAdmin ? "admin" : "inicio";
  return pedida === "onboarding" && !enCurso ? "inicio" : pedida;
}
