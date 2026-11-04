import { z } from "zod";
import type {
  CondicionCorrelativa,
  EventoHistorial,
  MateriaPropiaImportada,
  ParaCorrelativa,
  PlanCompleto,
  ProgresoMateria,
} from "../tipos";
import {
  Avisos,
  catalogoPorCodigo,
  normalizarEvento,
  normalizarProgreso,
  progresoVacio,
  resumirImportacion,
} from "./normalizar";
import type { ResultadoImportacion } from "./tipos";

/** Solo exige la forma que la app vieja exigía en `validar`; el resto se valida campo por campo. */
const esquemaMateria = z.looseObject({
  id: z.string().min(1),
  nombre: z.string().trim().min(1),
});
const esquemaLegacy = z.looseObject({ materias: z.array(esquemaMateria) });
type MateriaLegacy = z.infer<typeof esquemaMateria>;

function mensajeDeError(error: z.ZodError): string {
  const [seccion, posicion, campo] = error.issues[0]?.path ?? [];
  if (seccion === "materias" && typeof posicion === "number") {
    const falta = campo === "nombre" ? "nombre" : "id";
    return `El respaldo no es válido: la materia número ${posicion + 1} no tiene ${falta}.`;
  }
  return "El respaldo no es válido: no tiene una lista de materias.";
}

function textoONull(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

function enteroDesde(valor: unknown, minimo: number): number | null {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= minimo ? valor : null;
}

/** Como `normReq`: un string es una correlativa `aprobada`. */
function normalizarRequisito(crudo: unknown): { id: string | null; cond: unknown } {
  if (typeof crudo === "string") return { id: crudo, cond: "aprobada" };
  if (typeof crudo !== "object" || crudo === null) return { id: null, cond: undefined };
  const { id, cond } = crudo as { id?: unknown; cond?: unknown };
  return { id: typeof id === "string" && id !== "" ? id : null, cond };
}

function correlativasDePropia(
  materia: MateriaLegacy,
  destinos: Map<string, string>,
  catalogo: ReturnType<typeof catalogoPorCodigo>,
  avisos: Avisos,
): MateriaPropiaImportada["correlativas"] {
  const correlativas: MateriaPropiaImportada["correlativas"] = [];
  const secciones: [ParaCorrelativa, unknown][] = [
    ["cursar", materia.reqCursar],
    ["rendir", materia.reqRendir],
  ];
  for (const [para, requisitos] of secciones) {
    if (requisitos === null || requisitos === undefined) continue;
    if (!Array.isArray(requisitos)) {
      avisos.agregar(
        "correlativa-sin-resolver",
        materia.id,
        `${materia.nombre}: las correlativas para ${para} no son una lista, las descarté.`,
        requisitos,
      );
      continue;
    }
    for (const crudo of requisitos as unknown[]) {
      const { id, cond } = normalizarRequisito(crudo);
      const requiere = id === null ? undefined : (destinos.get(id) ?? catalogo.get(id)?.id);
      if (requiere === undefined || requiere === materia.id) {
        avisos.agregar(
          "correlativa-sin-resolver",
          materia.id,
          `${materia.nombre}: no encontré la correlativa ${id ?? "sin id"} para ${para}.`,
          crudo,
        );
        continue;
      }
      if (cond !== undefined && cond !== "regular" && cond !== "aprobada") {
        avisos.agregar(
          "dato-invalido",
          materia.id,
          `${materia.nombre}: la condición ${String(cond)} de ${id} no existe, usé "aprobada".`,
          cond,
        );
      }
      const condicion: CondicionCorrelativa = cond === "regular" ? "regular" : "aprobada";
      if (!correlativas.some((c) => c.requiere === requiere && c.para === para)) {
        correlativas.push({ requiere, para, condicion });
      }
    }
  }
  return correlativas;
}

function materiaPropia(
  materia: MateriaLegacy,
  codigo: string | null,
  destinos: Map<string, string>,
  catalogo: ReturnType<typeof catalogoPorCodigo>,
  avisos: Avisos,
): MateriaPropiaImportada {
  const anioValido = enteroDesde(materia.anio, 0);
  if (anioValido === null) {
    avisos.agregar(
      "dato-invalido",
      materia.id,
      `${materia.nombre}: el año no es válido, la dejé en extras.`,
      materia.anio,
    );
  }
  const anio = anioValido ?? 0;
  return {
    clave: materia.id,
    codigo,
    nombre: materia.nombre,
    anio,
    cuatrimestre: anio === 0 ? null : enteroDesde(materia.sem, 1),
    tipo: textoONull(materia.tipo) ?? "Materia",
    area: null,
    requiereAnioCompletoParaCursar: enteroDesde(materia.reqModuloCursar, 1),
    correlativas: correlativasDePropia(materia, destinos, catalogo, avisos),
  };
}

/**
 * Convierte un respaldo de "Mi Plan de Estudio" en datos del plan, con match por `codigo`. El
 * catálogo manda: de una materia con match solo se toma el progreso y el historial. No lanza
 * excepciones por archivos inválidos.
 */
export function importarLegacy(json: unknown, plan: PlanCompleto): ResultadoImportacion {
  const lectura = esquemaLegacy.safeParse(json);
  if (!lectura.success) return { ok: false, error: mensajeDeError(lectura.error) };

  const avisos = new Avisos();
  const catalogo = catalogoPorCodigo(plan);
  const idsDelCatalogo = new Set([...catalogo.values()].map((m) => m.id));
  const fuente =
    typeof lectura.data.fuente === "string" && lectura.data.fuente.startsWith("SIU")
      ? "siu"
      : "manual";

  // Primero se resuelven todos los destinos, porque una correlativa puede apuntar a una materia posterior.
  const destinos = new Map<string, string>();
  const aImportar: {
    materia: MateriaLegacy;
    destino: string;
    codigo: string | null;
    esPropia: boolean;
  }[] = [];
  const conMatch = new Set<string>();
  for (const materia of lectura.data.materias) {
    const codigo = textoONull(materia.codigo);
    const enCatalogo = codigo === null ? undefined : catalogo.get(codigo);
    const destino = enCatalogo?.id ?? materia.id;
    const repetida =
      destinos.has(materia.id) || (enCatalogo !== undefined && conMatch.has(enCatalogo.id));
    const chocaConCatalogo = enCatalogo === undefined && idsDelCatalogo.has(materia.id);
    if (repetida || chocaConCatalogo) {
      avisos.agregar(
        "materia-descartada",
        codigo ?? materia.id,
        `${materia.nombre}: la descarté porque ya hay otra materia con el mismo ${repetida ? "código o id" : "identificador"}.`,
      );
    } else {
      aImportar.push({ materia, destino, codigo, esPropia: enCatalogo === undefined });
      if (enCatalogo) conMatch.add(enCatalogo.id);
    }
    if (!destinos.has(materia.id) && !chocaConCatalogo) destinos.set(materia.id, destino);
  }

  const materiasPropias: MateriaPropiaImportada[] = [];
  const progreso: ProgresoMateria[] = [];
  const historial: EventoHistorial[] = [];
  for (const { materia, destino, codigo, esPropia } of aImportar) {
    if (esPropia) {
      avisos.agregar(
        "materia-sin-match",
        codigo ?? materia.id,
        `${materia.nombre}: no está en el catálogo del plan, la agregué como materia propia.`,
      );
      materiasPropias.push(materiaPropia(materia, codigo, destinos, catalogo, avisos));
    }

    const nombre = materia.nombre;
    const origen = { id: codigo ?? materia.id, nombre };
    const fila = normalizarProgreso(
      { ...materia, notaFinalExamen: materia.final },
      destino,
      origen,
      plan.plan,
      avisos,
    );
    if (!progresoVacio(fila)) progreso.push(fila);

    if (Array.isArray(materia.historial)) {
      for (const crudo of materia.historial as unknown[]) {
        const evento = normalizarEvento(crudo, destino, origen, fuente, plan.plan, avisos);
        if (evento) historial.push(evento);
      }
    } else if (materia.historial !== null && materia.historial !== undefined) {
      avisos.agregar(
        "dato-invalido",
        materia.id,
        `${nombre}: el historial no es una lista, lo descarté.`,
        materia.historial,
      );
    }
  }

  for (const materia of catalogo.values()) {
    if (!conMatch.has(materia.id)) {
      avisos.agregar(
        "materia-sin-datos",
        materia.codigo,
        `${materia.nombre}: no aparece en el respaldo, queda pendiente.`,
      );
    }
  }

  const datos = { materiasPropias, progreso, historial };
  return {
    ok: true,
    datos,
    reporte: { avisos: avisos.lista },
    resumen: resumirImportacion(plan, datos, conMatch.size, 0, avisos),
  };
}
