import { notaEnEscala } from "../calculo/sugerencias";
import type {
  DatosImportados,
  EventoHistorial,
  FuenteHistorial,
  Materia,
  Plan,
  PlanCompleto,
  ProgresoMateria,
  ResultadoHistorial,
  TipoHistorial,
} from "../tipos";
import { ESTADOS_MATERIA } from "../tipos";
import type { AvisoImportacion, ResumenImportacion, TipoAviso } from "./tipos";

const TIPOS_HISTORIAL: readonly TipoHistorial[] = [
  "Regularidad",
  "Examen",
  "Promocion",
  "En curso",
];
const RESULTADOS_HISTORIAL: readonly ResultadoHistorial[] = [
  "Aprobado",
  "Reprobado",
  "Ausente",
  "Promocionado",
  "En curso",
];

/** Avisos acumulados de una importación. */
export class Avisos {
  readonly lista: AvisoImportacion[] = [];

  agregar(tipo: TipoAviso, materia: string | null, mensaje: string, valor?: unknown): void {
    this.lista.push(
      valor === undefined ? { tipo, materia, mensaje } : { tipo, materia, mensaje, valor },
    );
  }
}

/** Cómo se identifica una materia del archivo en los avisos. */
export interface OrigenMateria {
  /** Código, id o clave en el archivo. */
  id: string;
  nombre: string;
}

/** Materias del catálogo (no propias) por código. */
export function catalogoPorCodigo(plan: PlanCompleto): Map<string, Materia> {
  const catalogo = new Map<string, Materia>();
  for (const materia of plan.materias) {
    if (materia.ownerId === null && materia.codigo) catalogo.set(materia.codigo, materia);
  }
  return catalogo;
}

function nombreDeCampo(campo: string): string {
  const nombres: Record<string, string> = {
    p1: "parcial 1",
    p2: "parcial 2",
    rec: "recuperatorio",
    notaCursada: "nota de cursada",
    notaFinalExamen: "final",
    nota: "nota final",
    aplazos: "aplazo",
    historial: "historial",
  };
  return nombres[campo] ?? campo;
}

function normalizarNota(
  valor: unknown,
  campo: string,
  origen: OrigenMateria,
  plan: Plan,
  avisos: Avisos,
): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number" && notaEnEscala(valor, plan)) return valor;
  avisos.agregar(
    "nota-fuera-de-escala",
    origen.id,
    `${origen.nombre}: descarté ${nombreDeCampo(campo)} ${String(valor)} porque está fuera de la escala ${plan.notaMin}-${plan.notaMax}.`,
    valor,
  );
  return null;
}

export interface ProgresoCrudo {
  [campo: string]: unknown;
  estado?: unknown;
  p1?: unknown;
  p2?: unknown;
  rec?: unknown;
  notaCursada?: unknown;
  notaFinalExamen?: unknown;
  nota?: unknown;
  aplazos?: unknown;
}

/**
 * Valida una fila de progreso del archivo. Estado desconocido → `pendiente`; notas fuera de escala
 * → se descartan. Todo se reporta.
 */
export function normalizarProgreso(
  crudo: ProgresoCrudo,
  materiaId: string,
  origen: OrigenMateria,
  plan: Plan,
  avisos: Avisos,
): ProgresoMateria {
  const estado = ESTADOS_MATERIA.find((e) => e === crudo.estado);
  if (!estado) {
    avisos.agregar(
      "estado-desconocido",
      origen.id,
      `${origen.nombre}: el estado ${String(crudo.estado)} no existe, la dejé pendiente.`,
      crudo.estado,
    );
  }
  const nota = (campo: "p1" | "p2" | "rec" | "notaCursada" | "notaFinalExamen" | "nota") =>
    normalizarNota(crudo[campo], campo, origen, plan, avisos);

  let aplazos: number[] = [];
  if (Array.isArray(crudo.aplazos)) {
    aplazos = crudo.aplazos.flatMap((aplazo: unknown) => {
      const valor = normalizarNota(aplazo, "aplazos", origen, plan, avisos);
      return valor === null ? [] : [valor];
    });
  } else if (crudo.aplazos !== null && crudo.aplazos !== undefined) {
    avisos.agregar(
      "dato-invalido",
      origen.id,
      `${origen.nombre}: los aplazos no son una lista, los descarté.`,
      crudo.aplazos,
    );
  }

  return {
    materiaId,
    estado: estado ?? "pendiente",
    p1: nota("p1"),
    p2: nota("p2"),
    rec: nota("rec"),
    notaCursada: nota("notaCursada"),
    notaFinalExamen: nota("notaFinalExamen"),
    nota: nota("nota"),
    aplazos,
  };
}

/** Una fila sin ningún dato equivale a no tener fila. */
export function progresoVacio(progreso: ProgresoMateria): boolean {
  return (
    progreso.estado === "pendiente" &&
    progreso.p1 === null &&
    progreso.p2 === null &&
    progreso.rec === null &&
    progreso.notaCursada === null &&
    progreso.notaFinalExamen === null &&
    progreso.nota === null &&
    progreso.aplazos.length === 0
  );
}

function fechaValida(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (!partes) return null;
  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const existe =
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia;
  return existe ? valor.slice(0, 10) : null;
}

/** Valida un evento del archivo. Sin fecha, tipo o resultado válidos se descarta y se reporta. */
export function normalizarEvento(
  crudo: unknown,
  materiaId: string,
  origen: OrigenMateria,
  fuente: FuenteHistorial,
  plan: Plan,
  avisos: Avisos,
): EventoHistorial | null {
  const evento = (typeof crudo === "object" && crudo !== null ? crudo : {}) as Record<
    string,
    unknown
  >;
  const fecha = fechaValida(evento.fecha);
  const tipo = TIPOS_HISTORIAL.find((t) => t === evento.tipo);
  const resultado = RESULTADOS_HISTORIAL.find((r) => r === evento.resultado);
  if (!fecha || !tipo || !resultado) {
    avisos.agregar(
      "evento-descartado",
      origen.id,
      `${origen.nombre}: descarté un evento del historial porque tiene fecha, tipo o resultado inválidos.`,
      crudo,
    );
    return null;
  }
  return {
    materiaId,
    fecha,
    tipo,
    nota: normalizarNota(evento.nota, "historial", origen, plan, avisos),
    resultado,
    fuente,
  };
}

export function resumirImportacion(
  plan: PlanCompleto,
  datos: DatosImportados,
  materiasConMatch: number,
  materiales: number,
  avisos: Avisos,
): ResumenImportacion {
  const totalMaterias =
    plan.materias.filter((m) => m.ownerId === null).length + datos.materiasPropias.length;
  const porEstado = { pendiente: 0, cursando: 0, final: 0, aprobada: 0 };
  for (const fila of datos.progreso) porEstado[fila.estado]++;
  porEstado.pendiente = totalMaterias - porEstado.cursando - porEstado.final - porEstado.aprobada;
  return {
    totalMaterias,
    porEstado,
    materiasConMatch,
    materiasPropias: datos.materiasPropias.length,
    eventos: datos.historial.length,
    materiales,
    avisos: avisos.lista.length,
  };
}
