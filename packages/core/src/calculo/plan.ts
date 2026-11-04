import type {
  DatosAlumno,
  EventoHistorial,
  Material,
  Materia,
  PlanCompleto,
  ResultadoHistorial,
} from "../tipos";

type Lugar = Pick<Materia, "anio" | "cuatrimestre">;

export interface GrupoMaterias {
  anio: number;
  /** Null en las anuales y en el grupo de extras (año 0), que reúne a todas sus materias. */
  cuatrimestre: number | null;
  materias: Materia[];
}

export interface IntentoFinal {
  /** Null si el intento no tiene nota, por ejemplo un ausente. */
  nota: number | null;
  resultado: ResultadoHistorial;
}

export interface ResumenFinal {
  /** Fecha de la última cursada aprobada, si está en el historial. */
  cursadaAprobada: string | null;
  /** Cada intento de final, del más viejo al más nuevo. */
  intentos: IntentoFinal[];
}

/** Por año y cuatrimestre, con las anuales antes del 1° y las extras (año 0) al final. */
function compararLugar(a: Lugar, b: Lugar): number {
  if (a.anio !== b.anio) {
    if (a.anio === 0) return 1;
    if (b.anio === 0) return -1;
    return a.anio - b.anio;
  }
  return (a.cuatrimestre ?? 0) - (b.cuatrimestre ?? 0);
}

/** Agrupa como `grouped` de la referencia, conservando el orden de `materias` dentro de cada grupo. */
export function agruparMaterias(materias: Materia[]): GrupoMaterias[] {
  const grupos = new Map<string, GrupoMaterias>();
  for (const materia of materias) {
    const anio = materia.anio;
    const cuatrimestre = anio === 0 ? null : materia.cuatrimestre;
    const clave = `${anio}-${cuatrimestre}`;
    const grupo = grupos.get(clave) ?? { anio, cuatrimestre, materias: [] };
    grupo.materias.push(materia);
    grupos.set(clave, grupo);
  }
  return [...grupos.values()].sort(compararLugar);
}

/** Todas las materias salvo `materiaId`, en el orden del plan: las que se pueden elegir como correlativa. */
export function opcionesDeCorrelativa(materias: Materia[], materiaId: string | null): Materia[] {
  return materias.filter((m) => m.id !== materiaId).sort(compararLugar);
}

/** Años con materias, en orden, y siempre las extras (año 0) al final. */
export function aniosDelPlan(materias: Pick<Materia, "anio">[]): number[] {
  const anios = new Set(materias.map((m) => m.anio).filter((anio) => anio !== 0));
  return [...[...anios].sort((a, b) => a - b), 0];
}

/** Los cuatrimestres del plan, más los que usen las materias propias. */
export function cuatrimestresDelAnio(
  datos: Pick<PlanCompleto, "plan" | "materias">,
  anio: number,
): number[] {
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

export function esAnual(materia: Lugar): boolean {
  return materia.anio !== 0 && materia.cuatrimestre == null;
}

export function esMateriaPropia(materia: Pick<Materia, "ownerId">): boolean {
  return materia.ownerId !== null;
}

function textoComparable(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Por nombre o código, sin distinguir mayúsculas ni tildes. Un texto en blanco las devuelve todas. */
export function buscarMaterias(materias: Materia[], texto: string): Materia[] {
  const buscado = textoComparable(texto.trim());
  return materias.filter(
    (m) =>
      textoComparable(m.nombre).includes(buscado) ||
      textoComparable(m.codigo ?? "").includes(buscado),
  );
}

/** Sin filas de progreso ni de historial: el alumno todavía no cargó nada. */
export function sinDatosCargados(datos: Pick<DatosAlumno, "progreso" | "historial">): boolean {
  return datos.progreso.length === 0 && datos.historial.length === 0;
}

/** Lo último que se cargó primero. */
export function materialesRecientes(materiales: Material[], limite: number): Material[] {
  return [...materiales].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limite);
}

/** Los materiales sin materia y los de una materia de la lista: lo que se ve con ese plan activo. */
export function materialesDelPlan(
  materiales: Material[],
  materias: Pick<Materia, "id">[],
): Material[] {
  const ids = new Set(materias.map((m) => m.id));
  return materiales.filter((m) => m.materiaId === null || ids.has(m.materiaId));
}

export function materialesDeMateria(materiales: Material[], materiaId: string): Material[] {
  return materiales.filter((m) => m.materiaId === materiaId);
}

/** Eventos de una materia, del más nuevo al más viejo; a igual fecha, el último cargado primero. */
export function historialDeMateria(
  historial: EventoHistorial[],
  materiaId: string,
): EventoHistorial[] {
  return historial
    .filter((h) => h.materiaId === materiaId)
    .reverse()
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Los datos de la vista de Finales pendientes, sin formatear. */
export function resumenFinal(historial: EventoHistorial[], materiaId: string): ResumenFinal {
  const eventos = historial
    .filter((h) => h.materiaId === materiaId)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const cursadas = eventos.filter((h) => h.tipo === "Regularidad" && h.resultado === "Aprobado");
  return {
    cursadaAprobada: cursadas.at(-1)?.fecha ?? null,
    intentos: eventos
      .filter((h) => h.tipo === "Examen")
      .map(({ nota, resultado }) => ({ nota, resultado })),
  };
}
