export const VISTAS = {
  inicio: "Inicio",
  materias: "Materias",
  aprobadas: "Aprobadas",
  cursando: "En curso",
  finales: "Finales pendientes",
  pendientes: "Pendientes",
  promedio: "Promedio",
  materiales: "Materiales",
  ajustes: "Ajustes",
  onboarding: "Elegí tu carrera",
} as const;

export type Vista = keyof typeof VISTAS;

/** `Object.hasOwn` y no `VISTAS[x]`: si no, `#constructor` contaría como vista. */
export function vistaDesdeHash(hash: string): Vista {
  const nombre = hash.replace(/^#/, "");
  return Object.hasOwn(VISTAS, nombre) ? (nombre as Vista) : "inicio";
}
