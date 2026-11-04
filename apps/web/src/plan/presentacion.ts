import type { DatosAlumno, EstadoMateria, EventoHistorial, Material, Materia } from "@estudia/core";

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
    const grupo = grupos.get(orden) ?? { titulo: lugarMateria(materia), materias: [] };
    grupo.materias.push(materia);
    grupos.set(orden, grupo);
  }
  return [...grupos.entries()].sort(([a], [b]) => a - b).map(([, grupo]) => grupo);
}

/** Saludo de Inicio, con los cortes de la referencia. */
export function saludoDeHora(hora: number): string {
  if (hora < 13) return "Buen día";
  return hora < 20 ? "Buenas tardes" : "Buenas noches";
}

/** Sin filas de progreso ni de historial: el alumno todavía no cargó nada. */
export function sinDatosCargados(datos: Pick<DatosAlumno, "progreso" | "historial">): boolean {
  return datos.progreso.length === 0 && datos.historial.length === 0;
}

/** Años con materias, en orden, y siempre las extras (año 0) al final. */
export function aniosDelPlan(materias: Materia[]): number[] {
  const anios = new Set(materias.map((m) => m.anio).filter((anio) => anio !== 0));
  return [...[...anios].sort((a, b) => a - b), 0];
}

/** Los cuatrimestres del plan, más los que usen las materias propias. */
export function cuatrimestresDelAnio(datos: DatosAlumno, anio: number): number[] {
  const delPlan = Array.from({ length: datos.plan.cuatrimestresPorAnio }, (_, i) => i + 1);
  const usados = datos.materias.flatMap((m) =>
    m.anio === anio && m.cuatrimestre != null ? [m.cuatrimestre] : [],
  );
  return [...new Set([...delPlan, ...usados])].sort((a, b) => a - b);
}

/** Una materia anual no tiene cuatrimestre: se ve en todas las pestañas de su año. */
export function materiasDePestania(
  materias: Materia[],
  anio: number,
  cuatrimestre: number,
): Materia[] {
  return materias.filter(
    (m) =>
      m.anio === anio && (anio === 0 || m.cuatrimestre === cuatrimestre || m.cuatrimestre == null),
  );
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Por nombre o código, sin distinguir mayúsculas ni tildes. */
export function buscarMaterias(materias: Materia[], texto: string): Materia[] {
  const buscado = normalizar(texto.trim());
  return materias.filter(
    (m) => normalizar(m.nombre).includes(buscado) || normalizar(m.codigo ?? "").includes(buscado),
  );
}

/** Lo último que se cargó primero. */
export function materialesRecientes(materiales: Material[], limite: number): Material[] {
  return [...materiales].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limite);
}

/** Extensión de un archivo para el recuadro del tipo de material. */
export function extensionDeArchivo(titulo: string): string {
  return (titulo.split(".").pop() || "doc").slice(0, 4);
}

export interface ResumenFinal {
  /** Fecha de la última cursada aprobada, si está en el historial. */
  cursadaAprobada: string | null;
  /** Nota de cada intento de final o, si no tiene (ausente), su resultado. */
  intentos: string[];
}

/** Lo que muestra la vista de Finales pendientes a partir del historial de una materia. */
export function resumenFinal(historial: EventoHistorial[], materiaId: string): ResumenFinal {
  const eventos = historial
    .filter((h) => h.materiaId === materiaId)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const cursadas = eventos.filter((h) => h.tipo === "Regularidad" && h.resultado === "Aprobado");
  return {
    cursadaAprobada: cursadas.at(-1)?.fecha ?? null,
    intentos: eventos
      .filter((h) => h.tipo === "Examen")
      .map((h) => (h.nota != null ? formatoNota(h.nota) : h.resultado.toLowerCase())),
  };
}
