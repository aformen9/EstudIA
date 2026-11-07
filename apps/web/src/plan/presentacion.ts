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

/** "2026-03-09" o un ISO completo → "09/03/2026". */
export function formatoFecha(fecha: string): string {
  return fecha.slice(0, 10).split("-").reverse().join("/");
}

export function cantidad(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** "A", "A y B", "A, B y C". */
export function enumerar(nombres: string[]): string {
  return new Intl.ListFormat("es", { type: "conjunction" }).format(nombres);
}

/** Nombre de la carrera (o su sigla, si no hay nombre) y versión del plan. */
export function etiquetaPlan(
  datos: Pick<DatosAlumno, "carreraNombre" | "carreraSigla" | "plan">,
): string {
  return [datos.carreraNombre ?? datos.carreraSigla, `Plan ${datos.plan.version}`]
    .filter(Boolean)
    .join(" · ");
}

/** Dónde queda una materia en el plan. */
export function lugarMateria({ anio, cuatrimestre }: Pick<Materia, "anio" | "cuatrimestre">) {
  if (anio === 0) return "Extras";
  return cuatrimestre == null ? `${anio}° año` : `${anio}° año · ${cuatrimestre}° cuatrimestre`;
}

/** Saludo de Inicio, con los cortes de la referencia. */
export function saludoDeHora(hora: number): string {
  if (hora < 13) return "Buen día";
  return hora < 20 ? "Buenas tardes" : "Buenas noches";
}

/** Extensión de un archivo para el recuadro del tipo de material. */
export function extensionDeArchivo(titulo: string): string {
  return (titulo.split(".").pop() || "doc").slice(0, 4);
}

/** "12 KB" o "3,4 MB", como `kb` de la referencia. */
export function formatoPeso(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1048576) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1048576).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB`;
}
