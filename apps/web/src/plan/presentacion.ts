import type { DatosAlumno, EstadoMateria, Materia } from "@estudia/core";

/** Los nombres de la referencia. */
export const ETIQUETAS_ESTADO: Record<EstadoMateria, string> = {
  pendiente: "Pendiente",
  cursando: "En curso",
  final: "Final pendiente",
  aprobada: "Aprobada",
};

/** Como `fmt` de la referencia: hasta dos decimales con coma. */
export function formatoNota(valor: number | null): string {
  if (valor == null) return "–";
  return (Math.round(valor * 100) / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

/** Nombre de la carrera (o su sigla, si no hay nombre) y versión del plan. */
export function etiquetaPlan(
  datos: Pick<DatosAlumno, "carreraNombre" | "carreraSigla" | "plan">,
): string {
  return [datos.carreraNombre ?? datos.carreraSigla, `Plan ${datos.plan.version}`]
    .filter(Boolean)
    .join(" · ");
}

export interface GrupoMaterias {
  titulo: string;
  materias: Materia[];
}

/** Por año y cuatrimestre, con las extras (año 0) al final, como `grouped` de la referencia. */
export function agruparMaterias(materias: Materia[]): GrupoMaterias[] {
  const grupos = new Map<number, GrupoMaterias>();
  for (const materia of materias) {
    const { anio, cuatrimestre } = materia;
    const orden = anio === 0 ? Number.MAX_SAFE_INTEGER : anio * 10 + (cuatrimestre ?? 0);
    const titulo =
      anio === 0
        ? "Extras"
        : cuatrimestre == null
          ? `${anio}° año`
          : `${anio}° año · ${cuatrimestre}° cuatrimestre`;
    const grupo = grupos.get(orden) ?? { titulo, materias: [] };
    grupo.materias.push(materia);
    grupos.set(orden, grupo);
  }
  return [...grupos.entries()].sort(([a], [b]) => a - b).map(([, grupo]) => grupo);
}
